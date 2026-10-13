import type { RankingService } from '../online'
import { queueSubmit } from '../online/uploads'
import { challengeIntro, challengeManual, challengeWaterFacts } from '../progress/challengeGuide'
import { collectJudge, runSeed, seedResult, type JudgeResult, type SeedResult } from '../progress/challengeJudge'
import { ChallengeRun, FAIL_TEXT, type RunStatus } from '../progress/challengeRun'
import { formatScore, goalText, medalFor, type ChallengeDef, type Medal } from '../progress/challenges'
import {
  countLines, isBetter, loadChallengeData, saveChallengeData, MAX_CODE_CHARS, type ChallengeData, type ChallengeRecord,
} from '../progress/challengeSave'
import { Game, type Settings } from '../progress/game'
import type { StorageLike } from '../progress/save'
import { ITEM_KINDS, type ItemKind } from '../sim/types'
import type { Audio } from './audio'
import { MEDAL_LABEL, MEDAL_ORDER, NO_NICKNAME_NOTE, OFFLINE_NOTE, markUploaded, medalBadge } from './challengeList'
import { dropCarriedKeyRepeat, iconHtml, ignoreKeyRepeat } from './chrome'
import { createConsole } from './console'
import { createGreenhouse } from './greenhouse'
import { createGuideBubble, h } from './guideBubble'
import { itemIcon } from './items'
import { createPanels, type PanelName } from './panels'
import { createRankingPanel } from './rankingPanel'
import type { Screen } from './router'

export const SPEEDS = [1, 4, 16] as const
// 배속이 높으면 한 프레임에 이벤트가 몰린다. 효과는 마지막 것들만 그려도 장면의 상태는 맞는다.
export const MAX_FRAME_EVENTS = 40

const SAVE_DEBOUNCE_MS = 1_000
const MAX_FRAME_MS = 250
const START_CODE = 'harvest()\n'
const SAVE_FAILED_NOTE = '이 브라우저에서는 과제의 코드와 기록을 저장할 수 없습니다. 창을 닫으면 사라집니다.'
const LONG_DRAFT_NOTE = `코드가 ${MAX_CODE_CHARS.toLocaleString('ko-KR')}자를 넘어 저장되지 않습니다. 실행은 할 수 있습니다.`
const OTHER_BATCH_TEXT = '다른 배치에서는 목표에 도달하지 못했습니다.'
export const STEP_ONLY_TEXT = '한 단계 실행으로는 목표를 채웠지만, 실행하기로 처음부터 끝까지 실행하면 목표를 채우지 못합니다. 기록은 실행하기로 성공해야 남습니다.'
const RERUN_TEXT = '기록은 실행하기로 처음부터 실행했을 때의 값입니다.'
const JUDGE_ERROR_TEXT = '심사 중에 문제가 생겨 기록을 남기지 못했습니다. 다시 실행해 주세요.'

export interface ResultView { score: string; medal: Medal | null; actions: number; lines: number; delta: string | null; isBest: boolean }

// 결과 화면에 적을 값. delta는 이전 최고 기록과의 차이이고, 이전 기록이 없으면 null이다.
export function resultView(def: ChallengeDef, r: JudgeResult, lines: number, old: ChallengeRecord | undefined): ResultView {
  const score = r.score ?? 0
  let delta: string | null = null
  if (old) {
    const diff = score - old.score
    const amount = formatScore(def, Math.abs(diff))
    if (diff === 0) delta = '이전 기록과 같음'
    else if (def.metric.kind === 'time') delta = diff < 0 ? `${amount} 단축` : `${amount} 느림`
    else delta = diff < 0 ? `${amount} 줄임` : `${amount} 늘어남`
  }
  return { score: formatScore(def, score), medal: medalFor(def, score), actions: r.actions, lines, delta, isBest: isBetter(def, score, old) }
}

// 한 단계 위의 등급까지 남은 차이. 금을 받았으면 null이다.
export function nextMedalText(def: ChallengeDef, score: number): string | null {
  const medal = medalFor(def, score)
  if (medal === 'gold') return null
  const next: Medal = medal === 'silver' ? 'gold' : medal === 'bronze' ? 'silver' : 'bronze'
  return `${MEDAL_LABEL[next]} 기준까지 ${formatScore(def, score - def.medals[next])}`
}

// 지금까지 흐른 시간(횟수 과제는 횟수)으로 아직 받을 수 있는 등급. 기록은 이 값보다 작아질 수 없다.
export function medalReach(def: ChallengeDef, current: number): Record<Medal, boolean> {
  return { gold: current <= def.medals.gold, silver: current <= def.medals.silver, bronze: current <= def.medals.bronze }
}

// 화면에 보이던 실행이 끝난 뒤에 무엇을 보여 주고 무엇을 기록으로 쓸지.
// result: judged를 기록으로 쓰고 결과 대화 상자를 띄운다(rerun이면 화면에 흐른 시간과 기록이 다를 수 있다고 알린다).
// stepOnly: 기록 없이 STEP_ONLY_TEXT만 보여 준다. batchFail: 기록 없이 실패한 배치를 알린다.
// mismatch: 한 단계 실행을 쓰지 않았는데 화면에서 성공한 첫 배치가 심사에서 실패했다. 생기지 않아야 하는 일이므로 심사 오류로 알린다.
export type RecordOutcome =
  | { kind: 'none' }
  | { kind: 'result'; judged: JudgeResult; rerun: boolean }
  | { kind: 'stepOnly' }
  | { kind: 'batchFail'; failed: SeedResult }
  | { kind: 'mismatch'; failed: SeedResult }

// 기록은 언제나 화면 없는 심사(judged)의 결과로 정한다. 화면의 실행은 심사를 시작할지만 정한다.
// 한 단계 실행을 쓰면 기다리는 일을 손이 대신 할 수 있어서, 같은 코드의 결과가 누르는 시점에 따라 달라지기 때문이다.
export function recordOutcome(def: ChallengeDef, screen: { ok: boolean; stepped: boolean }, judged: JudgeResult | null): RecordOutcome {
  if (!screen.ok || !judged) return { kind: 'none' }
  if (judged.ok && judged.score !== null) return { kind: 'result', judged, rerun: screen.stepped }
  const failed = judged.results.find(r => r.seed === judged.failedSeed)
  if (!failed) return { kind: 'none' }
  if (failed.seed === def.seeds[0]) return screen.stepped ? { kind: 'stepOnly' } : { kind: 'mismatch', failed }
  return { kind: 'batchFail', failed }
}

// 실패한 까닭을 기록 칸의 머리에 적을 문장. 화면에서 본 첫 배치가 아니면 다른 배치라는 것을 함께 알린다.
export function failNote(def: ChallengeDef, r: SeedResult): string {
  const why = r.reason ? FAIL_TEXT[r.reason] : ''
  return r.seed === def.seeds[0] ? why : `${OTHER_BATCH_TEXT} ${why}`.trim()
}

// 배치가 여러 개인 과제에서 지금 보고 있는 배치. 하나뿐이면 빈 문자열이다.
export function batchLabel(def: ChallengeDef, seed: number): string {
  if (def.seeds.length <= 1) return ''
  return `배치 ${Math.max(0, def.seeds.indexOf(seed)) + 1} / ${def.seeds.length}`
}

// 바닥에 칸으로 보일 자원: 목표 자원, 지금 가진 자원, 이번 실행에서 이미 보인 자원(seen).
// 한 번 보인 칸은 다 써도 남긴다. 달라진 것이 없으면 seen을 그대로 돌려준다. 물은 물탱크로 보인다.
export function visibleCargo(goal: ItemKind, items: Record<ItemKind, number>, seen: readonly ItemKind[]): readonly ItemKind[] {
  const next = ITEM_KINDS.filter(kind => kind !== 'Water' && (kind === goal || items[kind] > 0 || seen.includes(kind)))
  return next.length === seen.length ? seen : next
}

// 이 화면이 메모리에 든 기록과 저장소의 기록 가운데 더 좋은 것. 같으면 저장소의 것(올렸다는 표시가 있을 수 있다).
export function betterRecord(memory: ChallengeRecord | undefined, stored: ChallengeRecord | undefined): ChallengeRecord | undefined {
  if (!memory) return stored
  if (!stored) return memory
  return memory.score < stored.score ? memory : stored
}

export type UploadState = 'none' | 'sending' | 'sent' | 'failed' | 'nonick' | 'offline' | 'toolong' | 'unsaved'

export function uploadText(state: UploadState): string {
  switch (state) {
    case 'sending': return '랭킹에 올리는 중입니다.'
    case 'sent': return '랭킹에 올렸습니다.'
    case 'failed': return '랭킹에 올리지 못했습니다. 기록은 이 브라우저에 저장했고 다음에 다시 올립니다.'
    case 'nonick': return NO_NICKNAME_NOTE
    case 'offline': return OFFLINE_NOTE
    case 'toolong': return `코드가 ${MAX_CODE_CHARS.toLocaleString('ko-KR')}자를 넘어 기록을 저장하지 못했습니다.`
    case 'unsaved': return '이 브라우저에서는 기록을 저장할 수 없습니다.'
    case 'none': return ''
  }
}

// 최고 기록을 낸 뒤 랭킹에 올릴지, 올리지 않는다면 무엇을 알릴지 정한다. 저장하지 못했어도 올리기는 한다.
export function uploadPlan(s: { tooLong: boolean; saved: boolean; enabled: boolean; nickname: string | null }): UploadState {
  if (s.tooLong) return 'toolong'
  if (s.enabled && s.nickname !== null) return 'sending'
  if (!s.saved) return 'unsaved'
  return s.enabled ? 'nonick' : 'offline'
}

// 편집기의 처음 코드: 초안, 없으면 최고 기록의 코드, 그것도 없으면 처음 코드
export function initialCode(data: ChallengeData, id: string): string {
  return data.drafts[id] ?? data.records[id]?.code ?? START_CODE
}

export function capEvents<T>(events: T[], max: number): T[] {
  return events.length > max ? events.slice(-max) : events
}

// 기록 칸의 머리에 적는 안내 문장. noted는 실패한 까닭처럼 따로 적는 문장이 있다는 뜻이다.
export function statusLine(s: {
  judging: boolean; batches: number; status: RunStatus; paused: boolean; canResume: boolean; replaying: boolean; edited: boolean; noted: boolean; batch: string
}): string {
  if (s.judging) return s.batches > 1 ? `배치 ${s.batches}개에서 기록을 확인하는 중입니다.` : '기록을 확인하는 중입니다.'
  if (s.status === 'success') {
    // 다른 배치에서 실패했으면 그 까닭만 보여 준다.
    if (s.noted) return ''
    return s.replaying ? '다시 보기에서는 목표를 채웠습니다. 이 실행은 기록에 쓰지 않습니다.' : '목표를 채웠습니다.'
  }
  if (s.status !== 'running') return ''
  if (s.paused) {
    return s.canResume
      ? '멈췄습니다. 실행하기를 누르면 이어서 실행합니다.'
      : '코드를 고쳤습니다. 실행하기를 누르면 고친 코드로 처음부터 실행합니다.'
  }
  if (s.replaying) return `${s.batch}를 다시 보는 중입니다. 이 실행은 기록에 쓰지 않습니다.`
  if (s.edited) return '코드를 고쳤습니다. 다시 실행하면 적용됩니다.'
  return '실행 중입니다.'
}

// 고정된 문자열만 들어 있다. 과제의 이름과 플레이어가 쓴 글은 여기에 넣지 않는다.
const TEMPLATE = `
<div class="app challenge-app">
  <header class="topbar">
    <div class="brand">
      <h1></h1>
    </div>
    <nav>
      <button type="button" class="btn hud-btn back-btn">${iconHtml('home')}<span>과제 목록으로</span></button>
      <button type="button" class="btn hud-btn" data-panel="manual">${iconHtml('manual')}<span>설명서</span></button>
      <button type="button" class="btn hud-btn ranking-btn">${iconHtml('trophy')}<span>랭킹</span></button>
      <button type="button" class="btn hud-btn" data-panel="settings">${iconHtml('gear')}<span>설정</span></button>
    </nav>
  </header>
  <div class="save-note" role="status" hidden>
    ${iconHtml('warning')}
    <span class="save-note-text"></span>
    <button type="button" class="btn btn-sm save-note-close">닫기</button>
  </div>
  <main class="split">
    <section class="code-pane frame" data-state="idle"></section>
    <section class="farm-pane frame">
      <section class="goal-strip" aria-label="목표">
        <div class="goal-main">
          <div class="goal-line">
            <span class="goal-icon"></span>
            <strong class="goal-text"></strong>
            <span class="goal-batch" hidden></span>
          </div>
          <div class="goal-progress">
            <span class="goal-track" role="progressbar" aria-label="목표까지 모은 양" aria-valuemin="0"><i class="goal-fill"></i></span>
            <span class="goal-count"></span>
          </div>
        </div>
        <div class="goal-clock">
          <span class="goal-clock-label"></span>
          <strong class="goal-clock-value"></strong>
          <span class="goal-clock-sub"></span>
        </div>
        <div class="goal-medals">
          <span class="goal-medals-title"></span>
          <ul></ul>
        </div>
      </section>
      <div class="farm-stage">
        <div class="guide-host"></div>
        <div class="greenhouse-host"></div>
      </div>
    </section>
  </main>
  <div class="panel-host"></div>
  <dialog class="result-dialog"></dialog>
  <div class="ranking-host"></div>
</div>`

export function createChallengeApp(root: HTMLElement, def: ChallengeDef, opts: {
  storage: StorageLike; audio: Audio; ranking: RankingService; now: () => number
  onBack(): void
  settings?: Readonly<Settings> // 본편의 소리와 안내 설정. 이 화면에서 바꾼 값은 화면을 떠나면 버린다
}): Screen {
  root.innerHTML = TEMPLATE
  // document와 window에 건 이벤트는 이 신호로 한꺼번에 해제한다(destroy).
  const listeners = new AbortController()
  const { signal } = listeners
  let destroyed = false
  dropCarriedKeyRepeat(signal)
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
  const { storage, audio, ranking } = opts
  const mainSettings: Settings = { guide: opts.settings?.guide ?? true, sound: opts.settings?.sound ?? true }
  const settings: Settings = { ...mainSettings }
  audio.setEnabled(settings.sound)

  q('.brand h1').textContent = `과제 ${String(def.no).padStart(2, '0')} · ${def.title}`
  const greenhouse = createGreenhouse(q('.greenhouse-host'), audio)

  // ── 저장 ─────────────────────────────────────────────────
  // 과제 목록과 뒤늦게 끝난 올리기도 같은 키에 쓰므로, 쓰기 직전에 다시 읽어 이 화면이 바꾸는 부분만 고친다.
  const saveNote = q('.save-note')
  let saveFailureShown = false
  q('.save-note-close').addEventListener('click', () => { saveNote.hidden = true })
  // 저장할 수 없는 브라우저에서도 이 화면에 있는 동안에는 이전 기록과 비교하고 올릴 수 있게, 이 과제의 기록과 닉네임을 메모리에도 둔다.
  const stored = loadChallengeData(storage)
  let myRecord: ChallengeRecord | undefined = stored.records[def.id]
  let myNickname = stored.nickname
  // 저장소를 다시 읽어 메모리의 값과 맞춘다. 기록은 둘 가운데 더 좋은 것을 쓴다.
  const sync = (): ChallengeData => {
    const latest = loadChallengeData(storage)
    myRecord = betterRecord(myRecord, latest.records[def.id])
    myNickname = latest.nickname ?? myNickname
    return myRecord ? { ...latest, records: { ...latest.records, [def.id]: myRecord } } : latest
  }
  const write = (change: (latest: ChallengeData) => ChallengeData): boolean => {
    const saved = saveChallengeData(storage, change(sync()))
    if (!saved && !saveFailureShown) {
      saveFailureShown = true
      q('.save-note-text').textContent = SAVE_FAILED_NOTE
      saveNote.hidden = false
    }
    return saved
  }

  let code = initialCode(stored, def.id)
  let savedDraft = code
  let draftTimer: number | undefined
  const saveDraft = (): void => {
    window.clearTimeout(draftTimer)
    // 너무 긴 코드는 저장하지 않고, 앞서 저장한 초안을 그대로 둔다.
    if (code === savedDraft || code.length > MAX_CODE_CHARS) return
    savedDraft = code
    write(latest => ({ ...latest, drafts: { ...latest.drafts, [def.id]: code } }))
  }

  // ── 실행 ─────────────────────────────────────────────────
  // run은 온실에 보이는 실행이다. 실행하기 전과 끝난 뒤에도 그 상태를 그대로 그린다.
  let run = new ChallengeRun(def, def.seeds[0], code)
  let runCode = code // run을 만든 코드. 심사와 기록에 쓴다
  let replaying = false // 실패한 배치를 다시 보는 실행. 기록에 쓰지 않는다
  let handled: ChallengeRun | null = null // 끝난 것을 이미 처리한 실행
  let editedWhileRunning = false
  let failText = ''
  let failedBatch: SeedResult | null = null // '그 배치 보기'로 다시 볼 수 있는 배치
  // 화면 없는 심사. 화면의 실행이 목표에 닿으면 첫 배치부터 모든 배치를 다시 실행하고, 기록은 이 결과로만 정한다.
  // 배치 하나를 한 프레임에 실행하고, wait인 동안에는 안내 문장이 먼저 그려지게 기다린다.
  // screen은 화면의 실행이 낸 결과이다. 기록에는 쓰지 않고, 심사와 어긋났을 때 남기는 데에만 쓴다.
  let judging: { code: string; stepped: boolean; screen: SeedResult; results: SeedResult[]; wait: boolean } | null = null
  let speed: number = SPEEDS[0]
  let cargo: readonly ItemKind[] = [] // 바닥에 칸으로 보이는 자원. 한 번의 실행 안에서는 늘기만 한다

  const freshRun = (seed: number, source: string, replay: boolean): void => {
    // 같은 줄에서 다시 오류가 나거나 멈춰도 줄 강조가 새로 그려지도록 먼저 지운다.
    editor.setErrorLine(0)
    editor.setRunLine(0)
    editor.clearTrail()
    run = new ChallengeRun(def, seed, source)
    runCode = source
    replaying = replay
    handled = null
    editedWhileRunning = false
    failText = ''
    if (!replay) failedBatch = null
    cargo = []
  }
  // 화면에 보이던 실행이 끝났으면 한 번만 처리한다. 프레임마다 부르고, 한 단계 실행 직후와 새 실행을 시작하기 전에도 부른다.
  // 그러지 않으면 한 단계 실행으로 목표에 닿은 직후에 곧바로 다시 실행했을 때 그 성공이 버려진다.
  const settle = (): void => {
    if ((run.status !== 'success' && run.status !== 'failed') || handled === run) return
    handled = run
    onFinish()
  }
  const doRun = (): void => {
    settle()
    if (judging || dialog.open) return
    // 한 단계 실행으로 멈춰 있고 코드를 고치지 않았으면 이어서 실행한다. 그 밖에는 언제나 처음 상태에서 새로 시작한다.
    if (run.status === 'running' && run.game.canResume) { run.resume(); return }
    freshRun(def.seeds[0], code, false)
    run.start()
  }
  const doStop = (): void => {
    if (!judging) run.stop()
  }
  const doStep = (): void => {
    settle()
    if (judging || dialog.open) return
    const live = run.status === 'running' && (!run.game.paused || run.game.canResume)
    if (!live) freshRun(def.seeds[0], code, false)
    run.stepOnce()
    settle()
  }

  const terminal = createConsole(q('.code-pane'), code, {
    onRun: doRun,
    onStop: doStop,
    onStep: doStep,
    onEdit(next) {
      code = next
      run.game.code = next // 멈춘 동안 고쳤으면 이어서 실행하지 않는다(Game.canResume)
      if (run.status === 'running') editedWhileRunning = true
      window.clearTimeout(draftTimer)
      draftTimer = window.setTimeout(saveDraft, SAVE_DEBOUNCE_MS)
    },
  }, audio)
  const editor = terminal.editor
  const runButton = terminal.root.querySelector<HTMLButtonElement>('.run')!
  const stepButton = terminal.root.querySelector<HTMLButtonElement>('.step')!

  // 배속 단추. 기록은 시뮬레이션 시간으로 재므로 배속은 기록에 영향을 주지 않는다.
  const speedGroup = h('div', 'speed-group')
  speedGroup.setAttribute('role', 'group')
  speedGroup.setAttribute('aria-label', '배속')
  const speedButtons = SPEEDS.map(value => {
    const button = h('button', 'btn speed-btn', `${value}배`)
    button.type = 'button'
    button.addEventListener('click', () => { speed = value; syncSpeed() })
    speedGroup.append(button)
    return button
  })
  const syncSpeed = (): void => {
    speedButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(SPEEDS[i] === speed)))
  }
  syncSpeed()
  terminal.toolbar.classList.add('has-speed')
  terminal.toolbar.append(speedGroup)

  // 다른 배치에서 실패했을 때 기록 칸의 머리에 나오는 단추
  const replayButton = h('button', 'btn btn-sm replay-btn', '그 배치 보기')
  replayButton.type = 'button'
  replayButton.hidden = true
  terminal.root.querySelector('.log-head')!.append(replayButton)
  const startReplay = (): void => {
    if (!failedBatch || judging) return
    closeDialog()
    freshRun(failedBatch.seed, runCode, true)
    run.start()
  }
  replayButton.addEventListener('click', () => { audio.play('click'); startReplay() })

  // ── 목표 표시 ─────────────────────────────────────────────
  const countMetric = def.metric.kind === 'count'
  q('.goal-icon').append(itemIcon(def.goal.item))
  q('.goal-text').textContent = goalText(def)
  const goalBatch = q('.goal-batch')
  const goalTrack = q('.goal-track')
  const goalFill = q('.goal-fill')
  const goalCount = q('.goal-count')
  const clockValue = q('.goal-clock-value')
  const clockSub = q('.goal-clock-sub')
  goalTrack.setAttribute('aria-valuemax', String(def.goal.amount))
  q('.goal-clock-label').textContent = countMetric ? '자리를 바꾼 횟수' : '흐른 시간'
  q('.goal-medals-title').textContent = def.seeds.length > 1 ? `등급 기준(배치 ${def.seeds.length}개의 합)` : '등급 기준'
  const medalRows = MEDAL_ORDER.map(medal => {
    const row = h('li')
    const badge = medalBadge(medal)
    badge.classList.add('medal-sm')
    const out = h('span', 'sr-only', '받을 수 없음')
    out.hidden = true
    row.append(badge, h('span', 'goal-medal-score', formatScore(def, def.medals[medal])), out)
    q('.goal-medals ul').append(row)
    return { medal, row, out }
  })
  const setText = (el: HTMLElement, text: string): void => { if (el.textContent !== text) el.textContent = text }
  let goalKey = ''
  const renderGoal = (): void => {
    const { timeMs, counts } = run.stats
    const current = countMetric ? counts.swap : timeMs
    const progress = Math.min(run.progress, def.goal.amount)
    const batch = batchLabel(def, run.seed)
    const key = `${current}|${timeMs}|${progress}|${batch}|${replaying}`
    if (key === goalKey) return
    goalKey = key
    setText(goalCount, `${progress} / ${def.goal.amount}`)
    goalFill.style.width = `${(progress / def.goal.amount) * 100}%`
    goalFill.hidden = progress === 0
    goalTrack.setAttribute('aria-valuenow', String(progress))
    setText(clockValue, formatScore(def, current))
    const limit = def.limitMs / 1000
    setText(clockSub, countMetric ? `남은 시간 ${Math.max(0, Math.ceil((def.limitMs - timeMs) / 1000))}초` : `제한 시간 ${limit}초`)
    setText(goalBatch, replaying ? `${batch} 다시 보기(실패한 코드)` : batch)
    goalBatch.hidden = batch === ''
    const reach = medalReach(def, current)
    for (const { medal, row, out } of medalRows) {
      row.classList.toggle('is-out', !reach[medal])
      out.hidden = reach[medal]
    }
  }

  // ── 결과 대화 상자 ─────────────────────────────────────────
  // 브라우저의 dialog를 쓴다. 열려 있는 동안 뒤의 화면은 누를 수 없고, Tab은 그 안에서만 돈다.
  const dialog = q<HTMLDialogElement>('.result-dialog')
  const closeDialog = (): void => { if (dialog.open) dialog.close() }
  // 대화 상자의 제목. 화면 낭독기가 대화 상자의 이름으로 읽는다(aria-labelledby).
  const titled = <T extends HTMLElement>(el: T, id: string): T => { el.id = id; return el }
  const dialogButton = (label: string, primary: boolean, onClick: () => void): HTMLButtonElement => {
    const button = h('button', primary ? 'btn btn-lg primary' : 'btn btn-lg', label)
    button.type = 'button'
    ignoreKeyRepeat(button)
    button.addEventListener('click', () => { audio.play('click'); onClick() })
    return button
  }
  // 처음 초점은 단추가 아니라 대화 상자 자체에 둔다. 실행 중에 편집기에 글을 쓰다가 대화 상자가 떠도
  // 이어서 친 Enter나 Space가 단추를 누르지 않는다. Tab을 누르면 첫 단추로 간다.
  dialog.tabIndex = -1
  dialog.setAttribute('aria-labelledby', 'result-kicker result-title')
  const openDialog = (panel: HTMLElement): void => {
    panels.close()
    rankingPanel.close() // 실행 중에 열어 둔 랭킹 화면이 결과에 가려지지 않게 닫는다
    dialog.replaceChildren(panel)
    if (!dialog.open) dialog.showModal()
    dialog.focus()
  }
  // 랭킹 화면은 결과 대화 상자를 닫지 않고 그 위에 띄운다. 닫으면 결과가 그대로 보이고 초점은 누른 단추로 돌아간다.
  const rankingPanel = createRankingPanel(q('.ranking-host'), { audio, ranking })
  const openRanking = (opener: HTMLElement): void => {
    sync()
    rankingPanel.open(def, myRecord, myNickname, opener)
  }
  // 다른 화면으로 간다. 초안의 저장과 실행의 정리는 나가는 쪽(router)이 부르는 destroy가 한다.
  const leave = (go: () => void): void => {
    closeDialog()
    go()
  }

  function openResult(view: ResultView, judged: JudgeResult, upload: UploadState, rerun: boolean): HTMLElement {
    const panel = h('div', `panel frame result-panel${view.medal ? ` has-${view.medal}` : ''}`)
    const badge = medalBadge(view.medal)
    badge.classList.add('medal-xl')
    const stats = h('dl', 'result-stats')
    const stat = (label: string, value: string): void => {
      const box = h('div')
      box.append(h('dt', '', label), h('dd', '', value))
      stats.append(box)
    }
    stat('드론 동작', `${view.actions.toLocaleString('ko-KR')}번`)
    stat('코드', `${view.lines}줄`)
    stat('이전 최고 기록과의 차이', view.delta ?? '첫 기록')
    const uploadLine = h('p', 'result-upload', uploadText(upload))
    uploadLine.setAttribute('role', 'status')
    const again = dialogButton('다시 도전하기', true, () => { closeDialog(); editor.focus() })
    const board = dialogButton('랭킹 보기', false, () => openRanking(board))
    const buttons = h('div', 'result-buttons')
    buttons.append(
      again,
      board,
      dialogButton('과제 목록으로', false, () => leave(opts.onBack)),
    )
    panel.append(
      titled(h('p', 'result-kicker', '도전 성공'), 'result-kicker'),
      titled(h('h2', 'result-title', def.title), 'result-title'),
      badge,
      h('p', 'result-medal-name', view.medal ? `${MEDAL_LABEL[view.medal]} 등급` : '등급 없음'),
      h('p', 'result-score', view.score),
    )
    if (rerun) panel.append(h('p', 'result-hint', RERUN_TEXT))
    if (view.isBest && upload !== 'toolong') panel.append(h('p', 'result-best', '최고 기록입니다.'))
    const next = nextMedalText(def, judged.score ?? 0)
    if (next) panel.append(h('p', 'result-next', next))
    panel.append(stats)
    if (judged.results.length > 1) {
      const list = h('ul', 'result-batches')
      list.setAttribute('aria-label', '배치별 기록')
      for (const r of judged.results) {
        const row = h('li')
        row.append(h('span', '', batchLabel(def, r.seed)), h('strong', '', formatScore(def, r.score ?? 0)))
        list.append(row)
      }
      panel.append(list)
    }
    panel.append(uploadLine, buttons)
    openDialog(panel)
    return uploadLine
  }

  function openBatchFail(failed: SeedResult): void {
    const panel = h('div', 'panel frame result-panel is-fail')
    const watch = dialogButton('그 배치 보기', true, startReplay)
    const buttons = h('div', 'result-buttons')
    buttons.append(watch, dialogButton('닫기', false, () => { closeDialog(); editor.focus() }))
    panel.append(
      titled(h('p', 'result-kicker', batchLabel(def, failed.seed)), 'result-kicker'),
      titled(h('h2', 'result-title', OTHER_BATCH_TEXT), 'result-title'),
      h('p', 'result-why', failed.reason ? FAIL_TEXT[failed.reason] : ''),
    )
    if (failed.errorText) panel.append(h('p', 'result-error', failed.errorText))
    panel.append(h('p', 'result-hint', '그 배치를 온실에서 다시 볼 수 있습니다. 다시 보는 실행은 기록에 쓰지 않습니다.'), buttons)
    openDialog(panel)
  }

  // 올리기가 끝나면 저장소에서 최신 데이터를 다시 읽어 uploaded만 바꾼다. 화면을 떠난 뒤에 끝나도 저장은 한다.
  async function submit(record: ChallengeRecord, nickname: string, line: HTMLElement): Promise<void> {
    // 과제별 줄에 세운다. 앞선 올리기(이 화면의 느린 기록이나 과제 목록이 올리던 것)가 끝난 뒤에 시작하므로,
    // 돌아온 결과는 이 기록의 결과이다. 올리는 동안에는 과제 목록이 같은 과제를 다시 올리지 않는다.
    const result = await queueSubmit(ranking, {
      challengeId: def.id, nickname, score: record.score, actions: record.actions, lines: record.lines, code: record.code,
    })
    if (result !== 'failed') {
      if (myRecord && myRecord.score === record.score) myRecord = { ...myRecord, uploaded: true }
      const latest = loadChallengeData(storage)
      const next = latest.nickname === nickname ? markUploaded(latest, def.id, record.score) : latest
      if (next !== latest) saveChallengeData(storage, next)
    }
    if (!destroyed) line.textContent = uploadText(result === 'failed' ? 'failed' : 'sent')
  }

  function finishJudge(outcome: RecordOutcome, source: string, screen: SeedResult): void {
    if (outcome.kind === 'none') return
    if (outcome.kind === 'mismatch') {
      failText = JUDGE_ERROR_TEXT
      audio.play('fail')
      console.error('[gardener-replaced] 화면의 실행과 심사의 결과가 다릅니다', { challenge: def.id, seed: outcome.failed.seed, screen, judged: outcome.failed })
      return
    }
    if (outcome.kind === 'stepOnly') {
      failText = STEP_ONLY_TEXT
      audio.play('fail')
      return
    }
    if (outcome.kind === 'batchFail') {
      failedBatch = outcome.failed
      failText = failNote(def, outcome.failed)
      audio.play('fail')
      openBatchFail(outcome.failed)
      return
    }
    const { judged } = outcome
    const score = judged.score ?? 0
    const lines = countLines(source)
    sync()
    const view = resultView(def, judged, lines, myRecord)
    let upload: UploadState = 'none'
    let record: ChallengeRecord | null = null
    if (view.isBest) {
      // 기록의 코드는 길이 제한이 있어서, 넘으면 불러올 때 기록이 통째로 버려진다. 그런 기록은 저장하지 않는다.
      const tooLong = source.length > MAX_CODE_CHARS
      let saved = false
      if (!tooLong) {
        record = { score, actions: judged.actions, lines, code: source, at: opts.now(), uploaded: false }
        myRecord = record
        saved = write(latest => latest) // write가 메모리의 기록을 합쳐 쓴다
      }
      upload = uploadPlan({ tooLong, saved, enabled: ranking.enabled, nickname: myNickname })
    }
    audio.play('unlock')
    const line = openResult(view, judged, upload, outcome.rerun)
    if (record && upload === 'sending' && myNickname !== null) void submit(record, myNickname, line)
  }

  // 화면에 보이던 실행이 끝났을 때 한 번 부른다.
  function onFinish(): void {
    if (run.status === 'failed') {
      const why = run.reason ? FAIL_TEXT[run.reason] : ''
      failText = replaying && run.reason !== 'stopped' ? `${batchLabel(def, run.seed)}: ${why}` : why
      // 오류의 소리는 터미널이 낸다. 정지는 플레이어가 한 일이므로 소리를 내지 않는다.
      if (run.reason === 'timeout' || run.reason === 'ended') audio.play('fail')
      return
    }
    if (replaying) return
    // 화면의 실행이 낸 결과는 기록에 쓰지 않는다. 같은 코드를 화면 없이 처음부터 실행한 결과만 쓴다.
    judging = { code: runCode, stepped: run.stepped, screen: seedResult(run), results: [], wait: true }
  }

  function judgeNext(): void {
    if (!judging) return
    if (judging.wait) { judging.wait = false; return }
    const done = judging.results
    const seed = def.seeds.find(s => !done.some(r => r.seed === s))
    try {
      if (seed !== undefined) done.push(runSeed(def, seed, judging.code))
    } catch (err) {
      // 심사를 끝내고 다시 실행할 수 있게 한다. 원인은 개발자 콘솔에 남긴다.
      judging = null
      failText = JUDGE_ERROR_TEXT
      audio.play('fail')
      console.error('[gardener-replaced] 심사 중 내부 오류', err)
      return
    }
    const last = done[done.length - 1]
    if (last.status === 'success' && done.length < def.seeds.length) return
    const { code: source, stepped, screen } = judging
    judging = null
    finishJudge(recordOutcome(def, { ok: true, stepped }, collectJudge(def, done)), source, screen)
  }

  // ── 설명서, 설정, 안내 말풍선 ──────────────────────────────
  const guideBubble = createGuideBubble(q('.guide-host'), {
    onCopy() {}, // 과제의 안내에는 예제가 없다
    onShow() { audio.play('panel') },
  })
  guideBubble.setEnabled(settings.guide)
  // 설명서와 설정에 넘기는 게임. 실행할 때마다 게임을 새로 만들므로, 해금 집합과 설정만 담은 것을 따로 둔다.
  const panelGame = Game.forChallenge(def.setup(def.seeds[0]), def.unlocks, '')
  panelGame.settings = settings
  const panels = createPanels(q('.panel-host'), panelGame, {
    onBuy() {},
    onSettings() {
      guideBubble.setEnabled(settings.guide)
      audio.setEnabled(settings.sound)
    },
    onReset() {},
  }, { challenge: { entries: challengeManual(def), waterFacts: challengeWaterFacts(def) } })
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-panel]')) {
    ignoreKeyRepeat(button)
    button.addEventListener('click', () => {
      audio.play('panel')
      panels.open(button.dataset.panel as PanelName, button)
    })
  }

  const intro = challengeIntro(def)
  if (settings.guide && !stored.seenIntro.includes(def.id)) {
    guideBubble.showEntry(intro)
    write(latest => (latest.seenIntro.includes(def.id) ? latest : { ...latest, seenIntro: [...latest.seenIntro, def.id] }))
  } else {
    guideBubble.rememberEntry(intro)
  }

  ignoreKeyRepeat(q('.back-btn'))
  q('.back-btn').addEventListener('click', () => { audio.play('click'); leave(opts.onBack) })
  ignoreKeyRepeat(q('.ranking-btn'))
  q('.ranking-btn').addEventListener('click', () => { audio.play('panel'); openRanking(q('.ranking-btn')) })

  document.addEventListener('keydown', e => {
    if (e.defaultPrevented) return
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // 화면이 열려 있는 동안에는 실행하지 않는다. 그때에도 기본 동작은 막아, 초점이 놓인 단추가 눌리지 않게 한다.
      e.preventDefault()
      if (dialog.open || panels.current() !== null || rankingPanel.isOpen()) return
      e.stopPropagation()
      // 키를 누르고 있어서 생기는 반복 입력으로는 다시 실행하지 않는다.
      if (!e.repeat) doRun()
    } else if (e.key === 'Escape') {
      // 열려 있는 화면이나 말풍선이 있으면 그것만 닫고, 프로그램은 멈추지 않는다.
      e.preventDefault()
      if (rankingPanel.isOpen()) { e.stopPropagation(); rankingPanel.close(); return }
      if (dialog.open) { e.stopPropagation(); closeDialog(); return }
      if (panels.current() !== null) { e.stopPropagation(); panels.close(); return }
      if (guideBubble.isOpen()) { e.stopPropagation(); guideBubble.hide(); return }
      doStop()
    }
  }, { capture: true, signal })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveDraft()
  }, { signal })
  window.addEventListener('pagehide', saveDraft, { signal })

  const stateText = (): string => statusLine({
    judging: judging !== null, batches: def.seeds.length, status: run.status, paused: run.game.paused, canResume: run.game.canResume,
    replaying, edited: editedWhileRunning, noted: failText !== '', batch: batchLabel(def, run.seed),
  })

  let busyShown = false
  const frame = (dtMs: number): void => {
    if (destroyed) return
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? Math.min(dtMs, MAX_FRAME_MS) : 0
    run.advance(dt * speed)
    settle()
    cargo = visibleCargo(def.goal.item, run.game.world.state.items, cargo)
    greenhouse.render(run.game, capEvents(run.takeEvents(), MAX_FRAME_EVENTS), dt, { cargo })
    panels.refresh(panelGame)
    guideBubble.setNarrow(run.game.world.state.h === 1) // 한 줄짜리 선반에서는 화분을 덜 가리게 한다.
    renderGoal()
    const notes = [failText, code.length > MAX_CODE_CHARS ? LONG_DRAFT_NOTE : ''].filter(text => text !== '')
    terminal.render(run.game, { stateText: stateText(), note: notes.join(' '), stale: null })
    // 심사하는 동안에는 새로 실행할 수 없다.
    const busy = judging !== null
    if (busy !== busyShown) {
      busyShown = busy
      runButton.disabled = busy
      stepButton.disabled = busy
    }
    replayButton.hidden = failedBatch === null || busy || (replaying && run.status === 'running')
    judgeNext()
  }

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    listeners.abort()
    judging = null // 남은 배치의 심사를 그만둔다
    saveDraft()
    rankingPanel.destroy()
    closeDialog()
    panels.destroy()
    guideBubble.destroy()
    greenhouse.destroy()
    terminal.destroy()
    run.stop()
    // 이 화면에서 바꾼 소리 설정은 버리고 본편의 설정으로 돌아간다.
    audio.setEnabled(mainSettings.sound)
    root.replaceChildren()
  }

  editor.focus()

  return { frame, destroy }
}
