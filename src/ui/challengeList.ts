import type { RankingService } from '../online'
import { isUploading, queueSubmit } from '../online/uploads'
import { CHALLENGES, formatScore, goalText, medalFor, type ChallengeDef, type Medal } from '../progress/challenges'
import {
  cleanNickname, loadChallengeData, saveChallengeData, type ChallengeData, type ChallengeRecord,
} from '../progress/challengeSave'
import type { StorageLike } from '../progress/save'
import type { Audio } from './audio'
import { icon, ignoreKeyRepeat } from './chrome'
import type { Screen } from './router'
import { CRATE_SPRITES, DROP_SPRITE, PLANT_SPRITES, POT_SPRITE } from './sprites'

export interface CardInfo { no: number; title: string; concept: string; best: string; medal: Medal | null }

export function cardInfo(def: ChallengeDef, record: ChallengeRecord | undefined): CardInfo {
  const base = { no: def.no, title: def.title, concept: def.concept }
  if (!record) return { ...base, best: '기록 없음', medal: null }
  return { ...base, best: formatScore(def, record.score), medal: medalFor(def, record.score) }
}

export function medalCount(data: ChallengeData): { gold: number; silver: number; bronze: number } {
  const count = { gold: 0, silver: 0, bronze: 0 }
  for (const def of CHALLENGES) {
    const record = data.records[def.id]
    const medal = record && medalFor(def, record.score)
    if (medal) count[medal]++
  }
  return count
}

interface Target { id: string; record: ChallengeRecord }

// 닉네임을 정한 뒤 아직 서버에 올리지 못한 기록
export const pendingUploads = (data: ChallengeData): Target[] =>
  data.nickname === null
    ? []
    : CHALLENGES.flatMap(def => {
        const record = data.records[def.id]
        return record && !record.uploaded ? [{ id: def.id, record }] : []
      })

// 올린 기록을 올렸다고 표시한다. 그 사이 기록이 바뀌었으면(점수가 다르면) 건드리지 않고 같은 객체를 돌려준다.
export function markUploaded(data: ChallengeData, id: string, score: number): ChallengeData {
  const record = data.records[id]
  if (!record || record.score !== score) return data
  return { ...data, records: { ...data.records, [id]: { ...record, uploaded: true } } }
}

// 닉네임을 정한다. 이미 있던 닉네임을 바꾸면 올라간 기록도 uploaded를 false로 되돌려, 서버 반영이 실패해도 다음에 다시 올리게 한다.
export function withNickname(data: ChallengeData, name: string): ChallengeData {
  if (data.nickname === name) return data
  if (data.nickname === null) return { ...data, nickname: name }
  const records: Record<string, ChallengeRecord> = {}
  for (const [id, record] of Object.entries(data.records)) records[id] = { ...record, uploaded: false }
  return { ...data, nickname: name, records }
}

// 닉네임을 새로 정할 때 기준으로 삼을 데이터. 저장소의 닉네임이 기준이다. 다른 탭에서 닉네임을 바꾸고 기록을 올렸을 수 있다.
// 저장에 실패한 상태에서는 저장소에 닉네임이 없으므로 이 화면이 메모리에 들고 있는 닉네임을 쓴다.
export function nicknameBase(stored: ChallengeData, memory: string | null, saveFailed: boolean): ChallengeData {
  return saveFailed ? { ...stored, nickname: memory } : stored
}

export const MEDAL_LABEL: Record<Medal, string> = { gold: '금', silver: '은', bronze: '동' }
export const MEDAL_ORDER: Medal[] = ['gold', 'silver', 'bronze']
const NICK_ERROR = '닉네임은 2~10자로 정해 주세요.'
const SAVE_FAILED_NOTE = '이 브라우저에서는 닉네임과 기록을 저장할 수 없습니다.'
export const OFFLINE_NOTE = '지금은 랭킹에 연결할 수 없습니다. 내 기록은 이 브라우저에 저장됩니다.'
export const NO_NICKNAME_NOTE = '닉네임을 정하면 랭킹에 올릴 수 있습니다.'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

// 등급 표시. 색과 글자를 함께 쓰고, 등급이 없으면 빈 자리만 그린다.
export function medalBadge(medal: Medal | null): HTMLElement {
  const badge = el('span', medal ? `medal medal-${medal}` : 'medal medal-none')
  if (medal) badge.textContent = MEDAL_LABEL[medal]
  else badge.setAttribute('aria-hidden', 'true')
  return badge
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const POT_W = 43
const POT_H = 38
const SOIL_Y = 6.3 // 화분 위에서 흙면까지
const PLANT_SIZE = { Daisy: [45, 34], Strawberry: [51, 32], Sunflower: [30, 41], Tomato: [39, 35] } as const
type Crop = keyof typeof PLANT_SIZE
// 과제 그림. 화분의 배치(cols x rows)와 배율, 곁들이는 것. 같은 데이지라도 화분의 수로 선반의 모양을 알린다.
const ART: Record<number, { crop: Crop; cols: number; rows: number; scale: number; drop?: boolean } | 'crate'> = {
  1: { crop: 'Daisy', cols: 1, rows: 1, scale: 1.45 },
  2: { crop: 'Daisy', cols: 3, rows: 1, scale: 1.3 },
  3: { crop: 'Strawberry', cols: 1, rows: 1, scale: 1.45 },
  4: { crop: 'Daisy', cols: 3, rows: 3, scale: 0.85 },
  5: { crop: 'Strawberry', cols: 1, rows: 1, scale: 1.35, drop: true },
  6: { crop: 'Sunflower', cols: 1, rows: 1, scale: 1.35 },
  7: { crop: 'Tomato', cols: 1, rows: 1, scale: 1.45 },
  8: 'crate',
}
const ART_W = 200
const ART_H = 100

function svgImage(parent: Element, href: string, x: number, y: number, w: number, h: number): void {
  const img = document.createElementNS(SVG_NS, 'image')
  for (const [k, v] of Object.entries({ href, x, y, width: w, height: h })) img.setAttribute(k, String(v))
  parent.append(img)
}

// 카드 가운데에 놓을 그림. 장식이므로 화면 낭독기에는 알리지 않는다.
function challengeArt(no: number): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'cl-art')
  svg.setAttribute('viewBox', `0 0 ${ART_W} ${ART_H}`)
  svg.setAttribute('aria-hidden', 'true')
  const spec = ART[no]
  if (spec === 'crate') {
    const w = 128
    const h = (w * 94) / 160
    svgImage(svg, CRATE_SPRITES[3], (ART_W - w) / 2, (ART_H - h) / 2, w, h)
    return svg
  }
  if (!spec) return svg
  const { crop, cols, rows, scale, drop } = spec
  const [pw, ph] = PLANT_SIZE[crop]
  const gap = 4 * scale
  const dropW = drop ? 21 * scale : 0
  const dropGap = drop ? 8 : 0
  const totalW = cols * POT_W * scale + (cols - 1) * gap + dropW + dropGap
  const rowH = rows === 1 ? 0 : POT_H * scale * 0.62
  const left = (ART_W - totalW) / 2
  const contentH = (rows - 1) * rowH + POT_H * scale + (ph - SOIL_Y - 1.2) * scale
  const baseY = (ART_H + contentH) / 2
  // 뒷줄부터 그려 앞줄이 위에 놓이게 한다.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = left + (c + 0.5) * POT_W * scale + c * gap
      const by = baseY - (rows - 1 - r) * rowH
      const soilY = by - POT_H * scale + SOIL_Y * scale
      svgImage(svg, POT_SPRITE, cx - (POT_W * scale) / 2, by - POT_H * scale, POT_W * scale, POT_H * scale)
      const soil = document.createElementNS(SVG_NS, 'ellipse')
      for (const [k, v] of Object.entries({ cx, cy: soilY, rx: 17.2 * scale, ry: 4.3 * scale, fill: '#4a3224' })) soil.setAttribute(k, String(v))
      svg.append(soil)
      svgImage(svg, PLANT_SPRITES[crop][2], cx - (pw * scale) / 2, soilY + 1.2 * scale - ph * scale, pw * scale, ph * scale)
    }
  }
  if (drop) svgImage(svg, DROP_SPRITE, left + totalW - dropW, baseY - 31 * scale - 6, dropW, 31 * scale)
  return svg
}

export function createChallengeList(root: HTMLElement, opts: {
  storage: StorageLike; audio: Audio; ranking: RankingService; now: () => number
  onBack(): void; onOpen(id: string): void
}): Screen {
  const { storage, audio, ranking } = opts
  let editing = false
  // 저장할 수 없는 브라우저에서도 이 화면에 있는 동안에는 방금 정한 닉네임을 쓰도록 메모리에도 들고 있는다.
  let nickname = loadChallengeData(storage).nickname
  let saveFailed = false

  const screen = el('div', 'cl-screen')
  const header = el('header', 'topbar')
  const brand = el('div', 'brand')
  brand.append(el('h1', '', '도전 과제'))
  const nav = el('nav', '')
  const back = el('button', 'btn hud-btn')
  back.type = 'button'
  back.append(icon('home'), el('span', '', '처음 화면으로'))
  ignoreKeyRepeat(back)
  back.addEventListener('click', () => { audio.play('click'); opts.onBack() })
  nav.append(back)
  header.append(brand, nav)

  const body = el('main', 'cl-body')
  const summary = el('div', 'cl-summary')
  const medals = el('div', 'cl-medals')
  const nick = el('div', 'cl-nick')
  summary.append(medals, nick)
  const note = el('p', 'cl-note')
  const grid = el('div', 'cl-grid')
  body.append(summary, note, grid)
  screen.append(header, body)

  function renderNote(): void {
    note.textContent = saveFailed ? SAVE_FAILED_NOTE : OFFLINE_NOTE
    note.hidden = !saveFailed && ranking.enabled
  }

  function renderMedals(data: ChallengeData): void {
    const count = medalCount(data)
    medals.replaceChildren(el('span', 'cl-medals-title', '모은 등급'))
    for (const medal of MEDAL_ORDER) {
      const chip = el('span', 'cl-medal-count')
      chip.append(medalBadge(medal), el('span', 'cl-medal-num', `${count[medal]}개`))
      medals.append(chip)
    }
  }

  function renderCards(data: ChallengeData): void {
    grid.replaceChildren()
    for (const def of CHALLENGES) {
      const info = cardInfo(def, data.records[def.id])
      const card = el('button', `cl-card frame${info.medal ? ` has-${info.medal}` : ''}${data.records[def.id] ? '' : ' is-new'}`)
      card.type = 'button'
      const head = el('div', 'cl-card-head')
      head.append(el('span', 'cl-no', String(info.no).padStart(2, '0')), el('span', 'cl-concept', info.concept), medalBadge(info.medal))
      const best = el('span', 'cl-best-box')
      best.append(el('span', 'cl-best-label', '내 최고 기록'), el('span', 'cl-best', info.best))
      const foot = el('div', 'cl-card-foot')
      foot.append(best, el('span', 'cl-go', '도전하기'))
      const goal = goalText(def)
      card.setAttribute('aria-label', `${info.no}번 ${info.title}. 목표: ${goal}. 내 최고 기록: ${info.best}${info.medal ? `. 등급: ${MEDAL_LABEL[info.medal]}` : ''}`)
      card.append(head, el('span', 'cl-title', info.title), challengeArt(info.no), el('span', 'cl-goal', goal), foot)
      ignoreKeyRepeat(card)
      card.addEventListener('click', () => { audio.play('click'); opts.onOpen(def.id) })
      grid.append(card)
    }
  }

  // 닉네임 칸. 닉네임이 없거나 바꾸는 중이면 입력 칸을, 아니면 닉네임과 "바꾸기"를 보여 준다.
  // focus: 입력 칸으로 보낼지, 새로 생긴 "바꾸기" 단추로 보낼지(편집을 끝낸 뒤).
  function renderNick(focus: 'input' | 'change' | null = null): void {
    nick.replaceChildren()
    const current = nickname
    if (current !== null && !editing) {
      const change = el('button', 'btn btn-sm cl-nick-btn', '바꾸기')
      change.type = 'button'
      change.addEventListener('click', () => { audio.play('click'); editing = true; renderNick('input') })
      nick.append(el('span', 'cl-nick-label', '닉네임'), el('strong', 'cl-nick-name', current), change)
      if (focus === 'change') change.focus()
      return
    }
    const input = el('input', 'cl-nick-input')
    input.id = 'cl-nick-input'
    input.type = 'text'
    input.maxLength = 40
    input.autocomplete = 'off'
    input.spellcheck = false
    input.value = current ?? ''
    input.setAttribute('aria-describedby', 'cl-nick-error')
    input.setAttribute('aria-invalid', 'false')
    const label = el('label', 'cl-nick-label', '닉네임')
    label.htmlFor = input.id
    const error = el('p', 'cl-nick-error')
    error.id = 'cl-nick-error'
    error.setAttribute('role', 'alert')
    error.hidden = true
    const confirm = el('button', 'btn btn-sm cl-nick-btn primary', current === null ? '정하기' : '저장하기')
    confirm.type = 'button'
    const finish = (): void => { editing = false; renderNick('change') }
    const submitName = (): void => {
      const name = cleanNickname(input.value)
      if (name === null) {
        error.textContent = NICK_ERROR
        error.hidden = false
        input.setAttribute('aria-invalid', 'true')
        input.focus()
        return
      }
      audio.play('click')
      applyNickname(name)
    }
    confirm.addEventListener('click', submitName)
    input.addEventListener('keydown', e => {
      if (e.isComposing) return
      if (e.key === 'Enter') {
        e.preventDefault()
        // "바꾸기"를 누른 채 둔 Enter의 반복 입력이 곧바로 저장되지 않게 한다.
        if (!e.repeat) submitName()
      } else if (e.key === 'Escape' && current !== null) { e.preventDefault(); finish() }
    })
    input.addEventListener('input', () => { error.hidden = true; input.setAttribute('aria-invalid', 'false') })
    const row = el('div', 'cl-nick-row')
    row.append(label, input, confirm)
    if (current !== null) {
      const cancel = el('button', 'btn btn-sm cl-nick-btn', '취소하기')
      cancel.type = 'button'
      cancel.addEventListener('click', () => { audio.play('click'); finish() })
      row.append(cancel)
    }
    nick.append(row, error)
    if (focus === 'input') { input.focus(); input.select() }
  }

  // 지금 이 화면이 쓰는 닉네임. 저장하지 못한 경우에는 저장소가 아니라 메모리의 것이 기준이다.
  const liveNickname = (): string | null => (saveFailed ? nickname : loadChallengeData(storage).nickname)

  // 올릴 기록을 하나씩 올린다. 화면을 떠난 뒤에 끝나도 화면은 건드리지 않고, 저장소에서 최신 데이터를 다시 읽어 uploaded만 바꾼다.
  async function upload(list: Target[], name: string): Promise<void> {
    for (const { id, record } of list) {
      // 닉네임이 바뀌었으면 바꾼 쪽의 올리기가 이어받는다. 올리는 중인 과제는 건너뛴다.
      if (liveNickname() !== name) return
      // 화면을 떠났다가 곧바로 다시 들어와도, 과제 화면이 올리는 중이어도 같은 과제를 겹쳐 올리지 않는다.
      if (isUploading(id)) continue
      const result = await queueSubmit(ranking, {
        challengeId: id, nickname: name, score: record.score, actions: record.actions, lines: record.lines, code: record.code,
      })
      if (result === 'failed' || liveNickname() !== name) continue
      const latest = loadChallengeData(storage)
      const next = markUploaded(latest, id, record.score)
      if (next !== latest) saveChallengeData(storage, next)
    }
  }

  function applyNickname(name: string): void {
    const next = withNickname(nicknameBase(loadChallengeData(storage), nickname, saveFailed), name)
    saveFailed = !saveChallengeData(storage, next)
    nickname = name
    editing = false
    renderNote()
    renderNick('change')
    if (ranking.enabled) void upload(pendingUploads(next), name)
  }

  const data = loadChallengeData(storage)
  renderMedals(data)
  renderCards(data)
  renderNote()
  renderNick()
  root.replaceChildren(screen)
  grid.querySelector<HTMLElement>('.cl-card')?.focus()

  if (ranking.enabled && data.nickname !== null) void upload(pendingUploads(data), data.nickname)

  return {
    frame() {},
    destroy() {
      root.replaceChildren()
    },
  }
}
