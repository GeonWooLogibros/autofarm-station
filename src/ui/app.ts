import type { Game, OutputLine } from '../progress/game'
import { GUIDES } from '../progress/guide'
import { IncomeMeter } from '../progress/income'
import { resetGame, saveGame, type StorageLike } from '../progress/save'
import { unlockDef, type UnlockId } from '../progress/unlocks'
import type { Audio } from './audio'
import { dropCarriedKeyRepeat, iconHtml, ignoreKeyRepeat } from './chrome'
import { createConsole } from './console'
import type { Editor } from './editor'
import { createGreenhouse } from './greenhouse'
import { createGuideBubble, type GuideId } from './guideBubble'
import { affordableCount, createPanels, formatDuration, type PanelName } from './panels'
import type { Screen } from './router'

export interface App extends Screen {
  editor: Editor
  audio: Audio
  greenhouseHost: HTMLElement
  panelHost: HTMLElement
  guideHost: HTMLElement
  setRunNote(text: string): void
}

const SAVE_INTERVAL_MS = 10_000
const SAVE_DEBOUNCE_MS = 1_000
const BADGE_INTERVAL_MS = 250
const INCOME_INTERVAL_MS = 1_000
const START_CODE = 'harvest()'
const RERUN_NOTE = '새로 해금한 기능은 다시 실행하면 사용할 수 있습니다.'
const SAVE_FAILED_NOTE = '이 브라우저에서는 진행 상황을 저장할 수 없습니다. 창을 닫으면 지금까지의 진행이 사라집니다.'

// 고정된 문자열만 들어 있다. 게임 데이터나 플레이어가 쓴 글은 여기에 넣지 않는다.
const TEMPLATE = `
<div class="app">
  <header class="topbar">
    <div class="brand">
      <h1>오토팜 스테이션</h1>
      <button type="button" class="ending-chip" hidden></button>
    </div>
    <nav>
      <button type="button" class="btn hud-btn exit-btn">${iconHtml('home')}<span>처음 화면으로</span></button>
      <span class="nav-hint" hidden>해금할 수 있는 항목이 생겼습니다. 눌러서 확인해 보세요.</span>
      <button type="button" class="btn hud-btn" data-panel="unlocks">${iconHtml('unlock')}<span>해금</span><span class="badge" hidden></span></button>
      <button type="button" class="btn hud-btn" data-panel="manual">${iconHtml('manual')}<span>설명서</span></button>
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
      <div class="guide-host"></div>
      <div class="greenhouse-host"></div>
    </section>
  </main>
  <div class="panel-host"></div>
</div>`

export function createApp(
  root: HTMLElement, game: Game, storage: StorageLike, opts: { audio: Audio; onExit(): void },
): App {
  root.innerHTML = TEMPLATE
  // document와 window에 건 이벤트는 이 신호로 한꺼번에 해제한다(destroy).
  const listeners = new AbortController()
  const { signal } = listeners
  let destroyed = false
  dropCarriedKeyRepeat(signal)
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
  // 기록 칸 머리에 안내 문장 옆으로 나오는 알림
  let runNote = ''
  const setRunNote = (text: string): void => { runNote = text }

  const greenhouseHost = q('.greenhouse-host')
  const { audio } = opts
  let soundOn = game.settings.sound
  audio.setEnabled(soundOn)
  const greenhouse = createGreenhouse(greenhouseHost, audio)

  // 처음부터 다시 시작할 때에는 지운 저장 데이터를 다시 쓰지 않는다.
  let resetting = false
  // 저장하지 못하면(개인정보 보호 모드, 저장 공간 부족 등) 한 번만 알린다. 게임은 그대로 진행된다.
  const saveNote = q('.save-note')
  let saveFailureShown = false
  q('.save-note-close').addEventListener('click', () => { saveNote.hidden = true })
  const save = () => {
    if (resetting) return
    if (saveGame(storage, game) || saveFailureShown) return
    saveFailureShown = true
    q('.save-note-text').textContent = SAVE_FAILED_NOTE
    saveNote.hidden = false
  }
  // 대기 중인 디바운스 저장을 취소하고 바로 저장한다.
  const flushSave = () => {
    window.clearTimeout(saveTimer)
    save()
  }

  let editedWhileRunning = false
  let saveTimer: number | undefined

  // game.code는 편집기 변경마다 갱신되므로, 실행 직전에 따로 복사하지 않는다.
  // 새로 컴파일될 때에만 '고쳤습니다' 안내를 지운다(멈춘 상태에서 이어 실행하거나 정지할 때는 유지).
  // 새로 실행하기 직전에 부른다(멈춘 프로그램을 이어서 실행할 때에는 부르지 않는다).
  let staleOutput: OutputLine | null = null // 이 줄까지는 이전 실행에서 나온 출력이다.
  const beforeFreshRun = () => {
    // 구문 오류는 실행하는 즉시 나므로, 같은 줄에서 다시 오류가 나도 줄 강조가 새로 그려지도록 먼저 지운다.
    // 실행 줄도 같다: 멈춘 동안 코드를 통째로 바꾸면 강조가 사라지는데, 새 실행이 같은 줄 번호에서 멈추면 다시 그려지지 않는다.
    editor.setErrorLine(0)
    editor.setRunLine(0)
    editor.clearTrail()
    // 이전 실행의 오류가 그대로 보이면 고친 코드가 여전히 틀린 것처럼 보이므로, 지난 출력은 흐리게 표시한다.
    staleOutput = game.output.length ? game.output[game.output.length - 1] : null
  }
  const doRun = () => {
    // 멈춘 동안 코드를 고쳤다면 이어서 실행하지 않고 고친 코드로 처음부터 실행한다(Game.run이 판단한다).
    const resume = game.canResume
    if (!resume) beforeFreshRun()
    game.run()
    if (!resume) {
      editedWhileRunning = false
      if (runNote === RERUN_NOTE) setRunNote('')
    }
  }
  const doStop = () => {
    game.stop()
  }
  const doStep = () => {
    const fresh = game.status !== 'running' || (game.paused && !game.canResume)
    if (fresh) beforeFreshRun()
    game.stepOnce()
    if (fresh) {
      editedWhileRunning = false
      if (runNote === RERUN_NOTE) setRunNote('')
    }
  }

  const terminal = createConsole(q('.code-pane'), game.code, {
    onRun: doRun,
    onStop: doStop,
    onStep: doStep,
    onEdit(code) {
      game.code = code // 실행 중인 프로그램은 이미 컴파일되었으므로 다음 실행부터 적용된다.
      if (game.status === 'running') editedWhileRunning = true
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(save, SAVE_DEBOUNCE_MS)
    },
  }, audio)
  const editor = terminal.editor

  // ── 해금, 설명서, 설정, 엔딩 화면과 안내 말풍선 ──────────────
  const exampleCodes = new Set(GUIDES.map(g => g.example.trim()).filter(code => code !== ''))
  const guideBubble = createGuideBubble(q('.guide-host'), {
    onCopy(code, copied) {
      // 플레이어가 직접 쓴 코드는 덮어쓰지 않는다. 비어 있거나, 처음 코드이거나, 예제를 그대로 둔 경우에만 바꾼다.
      const now = editor.getCode().trim()
      if (now === '' || now === START_CODE || exampleCodes.has(now)) {
        editor.setCode(`${code}\n`)
        guideBubble.note('예제를 편집기에 넣었습니다.')
      } else if (copied) {
        guideBubble.note('예제를 복사했습니다. 편집기에 붙여 넣어 사용하세요.')
      } else {
        guideBubble.note('복사하지 못했습니다. 예제를 직접 선택하여 복사해 주세요.')
      }
    },
    onShow() { audio.play('panel') },
  })
  guideBubble.setEnabled(game.settings.guide)

  const onBuy = (id: UnlockId): void => {
    if (!game.buy(id)) return
    audio.play('unlock')
    flushSave()
    if (id === 'automation') {
      panels.open('ending')
    } else if (game.settings.guide) {
      panels.close()
      guideBubble.show(id)
      game.seenGuides.add(id)
      save()
    }
    // 속도, 선반 크기, 수확량, 작물은 바로 적용된다. 새 문법과 함수는 다시 실행해야 쓸 수 있다.
    const def = unlockDef(id)
    const addsCode = def.features.length + def.names.length > 0
    if (game.status === 'running' && addsCode) setRunNote(RERUN_NOTE)
  }

  const panels = createPanels(q('.panel-host'), game, {
    onBuy,
    onSettings() {
      guideBubble.setEnabled(game.settings.guide)
      flushSave()
    },
    onReset() {
      resetting = true
      window.clearTimeout(saveTimer)
      resetGame(storage)
      window.location.reload()
    },
  })

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-panel]')) {
    // 키를 누르고 있어서 생기는 반복 입력으로는 화면을 열지 않는다(해금 직후 화면이 다시 열려 연달아 해금되는 것을 막는다).
    ignoreKeyRepeat(button)
    button.addEventListener('click', () => {
      audio.play('panel')
      panels.open(button.dataset.panel as PanelName, button)
    })
  }
  const badge = q('.badge')
  const unlockButton = q<HTMLButtonElement>('[data-panel="unlocks"]')
  const endingChip = q<HTMLButtonElement>('.ending-chip')
  endingChip.addEventListener('click', () => panels.open('ending', endingChip))

  // 처음 시작한 게임이면 인트가 첫 안내를 한다. 이어서 하는 게임이면 마지막 안내를 다시 볼 수 있게만 한다.
  if (game.playMs === 0 && game.unlocked.size === 0) {
    guideBubble.show('start')
  } else {
    const seen = [...game.seenGuides]
    const last: GuideId = seen.length ? seen[seen.length - 1] : 'start'
    guideBubble.remember(last)
  }

  document.addEventListener('keydown', e => {
    if (e.defaultPrevented) return
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // 화면이 열려 있는 동안에는 실행하지 않는다. 그때에도 기본 동작은 막아, 초점이 놓인 단추가 눌리지 않게 한다.
      e.preventDefault()
      if (panels.current() !== null) return
      e.stopPropagation()
      // 키를 누르고 있어서 생기는 반복 입력으로는 다시 실행하지 않는다.
      if (!e.repeat) doRun()
    } else if (e.key === 'Escape') {
      // 열려 있는 화면이나 말풍선이 있으면 그것만 닫고, 프로그램은 멈추지 않는다.
      if (panels.current() !== null) {
        e.preventDefault()
        e.stopPropagation()
        panels.close()
        return
      }
      e.preventDefault()
      if (guideBubble.isOpen()) {
        e.stopPropagation()
        guideBubble.hide()
        return
      }
      doStop()
    }
  }, { capture: true, signal })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave()
  }, { signal })
  window.addEventListener('pagehide', flushSave, { signal })

  // 처음 화면으로: 바로 저장하고 프로그램을 멈춘 뒤 나간다. 화면의 정리는 나가는 쪽(router)이 destroy로 한다.
  ignoreKeyRepeat(q('.exit-btn'))
  q('.exit-btn').addEventListener('click', () => {
    audio.play('click')
    flushSave()
    game.stop()
    opts.onExit()
  })

  const stateText = (): string => {
    if (game.status === 'error') return '오류가 발생했습니다.'
    if (game.status === 'running') {
      if (game.paused) {
        return game.canResume
          ? '멈췄습니다. 실행하기를 누르면 이어서 실행합니다.'
          : '코드를 고쳤습니다. 실행하기를 누르면 고친 코드로 처음부터 실행합니다.'
      }
      if (editedWhileRunning) return '코드를 고쳤습니다. 다시 실행하면 적용됩니다.'
      return '실행 중입니다.'
    }
    return ''
  }

  let sinceBadgeMs = BADGE_INTERVAL_MS
  let badgeCount = -1
  let hintShown = false
  const navHint = q('.nav-hint')
  let endingText = ''
  const renderTopbar = () => {
    const n = affordableCount(game)
    if (n !== badgeCount) {
      badgeCount = n
      badge.textContent = String(n)
      badge.hidden = n === 0
      unlockButton.setAttribute('aria-label', n === 0 ? '해금' : `해금, 지금 해금할 수 있는 항목 ${n}개`)
      unlockButton.classList.toggle('has-buyable', n > 0)
    }
    // 아직 아무것도 해금하지 않은 플레이어에게는 다음에 할 일을 알려 준다.
    const hint = n > 0 && game.unlocked.size === 0
    if (hint !== hintShown) {
      hintShown = hint
      navHint.hidden = !hint
      unlockButton.classList.toggle('is-first', hint)
    }
    const text = game.finishedAtMs === null ? '' : `자동화 완료 · ${formatDuration(game.finishedAtMs)}`
    if (text !== endingText) {
      endingText = text
      endingChip.textContent = text
      endingChip.hidden = text === ''
      endingChip.title = '엔딩 화면 다시 보기'
    }
  }

  // 분당 수입: 수확할 때마다 온실의 시각과 함께 적어 두고, 화면의 값은 1초에 한 번만 바꾼다. 저장하지 않는다.
  const income = new IncomeMeter()
  let incomeShown = income.perMinute(game.world.state.timeMs)
  let sinceIncomeMs = 0

  let sinceSaveMs = 0
  const frame = (dtMs: number): void => {
    if (destroyed) return
    game.tick(dtMs)
    // 설정 화면이 어디에서 값을 바꾸든 소리 켜짐 상태가 따라가게 한다.
    if (game.settings.sound !== soundOn) {
      soundOn = game.settings.sound
      audio.setEnabled(soundOn)
    }
    const events = game.world.takeEvents()
    for (const e of events) if (e.type === 'harvest') income.add(e.item, e.amount, game.world.state.timeMs)
    sinceIncomeMs += Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0
    if (sinceIncomeMs >= INCOME_INTERVAL_MS) {
      sinceIncomeMs = 0
      incomeShown = income.perMinute(game.world.state.timeMs)
    }
    greenhouse.render(game, events, dtMs, { income: incomeShown })
    panels.refresh(game)
    guideBubble.setNarrow(game.world.state.h === 1) // 한 줄짜리 선반에서는 화분을 덜 가리게 한다.
    sinceBadgeMs += Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0
    if (sinceBadgeMs >= BADGE_INTERVAL_MS) {
      sinceBadgeMs = 0
      renderTopbar()
    }
    if (game.status !== 'running' && runNote === RERUN_NOTE) setRunNote('')
    terminal.render(game, { stateText: stateText(), note: runNote, stale: staleOutput })
    if (Number.isFinite(dtMs) && dtMs > 0) sinceSaveMs += dtMs
    if (sinceSaveMs >= SAVE_INTERVAL_MS) {
      sinceSaveMs = 0
      save()
    }
  }

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    listeners.abort()
    panels.destroy()
    guideBubble.destroy()
    greenhouse.destroy()
    terminal.destroy()
    // 같은 게임으로 다시 들어올 수 있으므로 프로그램을 멈추고, 저장되지 않는 실행 흔적(오류 줄, 기록)은 지운다.
    game.stop()
    game.errorLine = 0
    game.errorCause = undefined
    game.output.length = 0
    flushSave()
    root.replaceChildren()
  }

  editor.focus()

  return {
    frame,
    destroy,
    editor,
    audio,
    greenhouseHost,
    panelHost: q('.panel-host'),
    guideHost: q('.guide-host'),
    setRunNote,
  }
}
