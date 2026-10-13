import { guideFor, type GuideEntry } from '../progress/guide'
import { unlockDef, type UnlockId } from '../progress/unlocks'
import { plantCost } from '../sim/balance'
import { icon } from './chrome'
import { costChips } from './items'
import { INT_SPRITES } from './sprites'

export type GuideId = UnlockId | 'start'

export interface GuideBubble {
  show(id: GuideId): void // 말풍선을 펼쳐 보여 준다
  remember(id: GuideId): void // 펼치지 않고 '안내 다시 보기'로만 볼 수 있게 한다
  showEntry(entry: GuideEntry): void // 해금 항목이 아닌 안내(과제의 설명)를 펼쳐 보여 준다
  rememberEntry(entry: GuideEntry): void
  hide(): void // 말풍선을 접는다. '안내 다시 보기' 단추는 남는다
  setEnabled(on: boolean): void // 끄면 말풍선과 단추를 모두 숨긴다
  setNarrow(on: boolean): void // 선반이 한 줄뿐일 때 화분을 덜 가리도록 폭을 줄인다
  isOpen(): boolean
  note(text: string): void // 복사 결과처럼 짧은 알림을 말풍선 안에 표시한다
  destroy(): void // 말풍선과 단추를 떼어 낸다. 끝나지 않은 복사의 결과는 버린다
}

export interface GuideHooks {
  onCopy(code: string, copied: boolean): void // copied는 클립보드에 복사했는지 여부
  onShow?(): void
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, className = '', text = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

// ── 문장 속의 코드 ─────────────────────────────────────────
// 안내 문장에 섞여 있는 함수 이름과 문법을 코드 글꼴로 구분한다. 문자열은 언제나 텍스트 노드로만 넣는다.
const LITERALS = [
  'd[키] = 값', 'for 키 in d:', 'def 이름():', '.append(값)', 'return 값', 'if 조건:', 'd = {}', '(x, y)', '(0, 0)',
  'd[키]', '[번호]', '이름()', '[ ]',
]
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const WORD = String.raw`[A-Za-z_][A-Za-z0-9_]*(?:\([^()가-힣]*\))?`
const OPERAND = String.raw`(?:${WORD}|\d+)`
const INLINE_CODE = new RegExp(
  `${LITERALS.map(escapeRe).join('|')}|${WORD}(?: (?:[-+*/]?=|==|!=|[<>]=?) ${OPERAND}| ${WORD})*:?`,
  'g',
)

export function richText(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  let last = 0
  for (const m of text.matchAll(INLINE_CODE)) {
    const at = m.index ?? 0
    if (at > last) frag.append(text.slice(last, at))
    frag.append(h('code', 'inline-code', m[0]))
    last = at + m[0].length
  }
  if (last < text.length) frag.append(text.slice(last))
  return frag
}

// ── 예제 코드 ─────────────────────────────────────────────
// 편집기와 같은 색으로 칠한다(editor.ts의 highlight와 맞춘 값은 style.css의 .tok-* 에 있다).
const KEYWORDS = new Set([
  'while', 'if', 'elif', 'else', 'for', 'in', 'def', 'return', 'and', 'or', 'not', 'break', 'continue', 'pass',
])
const ATOMS = new Set(['True', 'False', 'None'])
const TOKEN = /(#.*)|("[^"\n]*"|'[^'\n]*')|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)(?=(\s*\()?)/g

export function codeBlock(code: string): HTMLPreElement {
  const pre = h('pre', 'code-block')
  const lines = code.split('\n')
  lines.forEach((line, i) => {
    let last = 0
    for (const m of line.matchAll(TOKEN)) {
      const at = m.index ?? 0
      const word = m[0]
      let cls = ''
      if (m[1]) cls = 'tok-comment'
      else if (m[2]) cls = 'tok-string'
      else if (m[3]) cls = 'tok-atom'
      else if (KEYWORDS.has(word)) cls = 'tok-keyword'
      else if (ATOMS.has(word)) cls = 'tok-atom'
      else if (m[5] !== undefined) cls = 'tok-call'
      if (!cls) continue
      if (at > last) pre.append(line.slice(last, at))
      pre.append(h('span', cls, word))
      last = at + word.length
    }
    if (last < line.length) pre.append(line.slice(last))
    if (i < lines.length - 1) pre.append('\n')
  })
  return pre
}

// 안내 한 항목의 본문, 예제, 목표. 말풍선과 설명서가 함께 쓴다.
export function guideContent(entry: GuideEntry, onCopy?: (code: string, button: HTMLButtonElement) => void): HTMLElement {
  const box = h('div', 'guide-content')
  // 작물을 여는 항목은 그 작물을 심을 때 드는 값을 맨 위에 보여 준다. 값은 규칙(PLANT_COST)에서 가져온다.
  const planting = entry.id === 'start' ? [] : unlockDef(entry.id).plants.flatMap(plantCost)
  if (planting.length > 0) {
    const line = h('p', 'guide-cost')
    line.append(h('span', 'guide-label', '심는 비용'), ...costChips(planting), h('span', 'guide-cost-note', '한 번 심을 때마다 씁니다.'))
    box.append(line)
  }
  const body = h('ul', 'guide-body')
  for (const sentence of entry.body) {
    const li = h('li')
    li.append(richText(sentence))
    body.append(li)
  }
  box.append(body)
  if (entry.example) {
    const example = h('div', 'guide-example')
    const head = h('div', 'guide-example-head')
    head.append(h('span', 'guide-label', '예제'))
    if (onCopy) {
      const copy = h('button', 'btn btn-sm guide-copy', '예제 복사하기')
      copy.type = 'button'
      copy.addEventListener('click', () => onCopy(entry.example, copy))
      head.append(copy)
    }
    const pre = codeBlock(entry.example)
    pre.tabIndex = 0
    pre.setAttribute('aria-label', '예제 코드')
    example.append(head, pre)
    box.append(example)
  }
  if (entry.goal) {
    const goal = h('p', 'guide-goal')
    goal.append(h('span', 'guide-label', '해 볼 것'), richText(entry.goal))
    box.append(goal)
  }
  return box
}

const COPY_TIMEOUT_MS = 1500

// 브라우저의 권한 창에 답하지 않으면 복사가 끝나지 않으므로, 정해진 시간 안에 끝나지 않으면 실패로 본다.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    let timer: number | undefined
    const written = navigator.clipboard.writeText(text).then(() => true, () => false)
    const timedOut = new Promise<boolean>(resolve => { timer = window.setTimeout(() => resolve(false), COPY_TIMEOUT_MS) })
    const copied = await Promise.race([written, timedOut])
    window.clearTimeout(timer)
    return copied
  } catch {
    return false // 권한이 없거나 지원하지 않는 환경
  }
}

export function createGuideBubble(host: HTMLElement, hooks: GuideHooks): GuideBubble {
  const bubble = h('section', 'guide-bubble frame')
  bubble.setAttribute('role', 'region')
  bubble.setAttribute('aria-label', '인트의 안내')
  bubble.hidden = true

  const head = h('header', 'guide-head')
  const face = h('span', 'guide-face')
  const faceImg = h('img')
  faceImg.src = INT_SPRITES.idle
  faceImg.alt = ''
  face.append(faceImg)
  const names = h('div', 'guide-names')
  names.append(h('span', 'guide-who', '인트의 안내'))
  const title = h('h2', 'guide-title')
  title.setAttribute('aria-live', 'polite') // 새 안내가 뜨면 제목만 읽어 준다
  names.append(title)
  head.append(face, names)

  const scroll = h('div', 'guide-scroll')
  const foot = h('footer', 'guide-foot')
  const noteEl = h('span', 'guide-note')
  noteEl.setAttribute('role', 'status')
  const ok = h('button', 'btn primary guide-ok', '확인')
  ok.prepend(icon('check'))
  ok.type = 'button'
  foot.append(noteEl, ok)
  bubble.append(head, scroll, foot)

  const chip = h('button', 'guide-chip')
  chip.type = 'button'
  chip.hidden = true
  const chipFace = h('span', 'guide-face')
  const chipImg = h('img')
  chipImg.src = INT_SPRITES.idle
  chipImg.alt = ''
  chipFace.append(chipImg)
  chip.append(chipFace, h('span', '', '안내 다시 보기'))

  host.append(bubble, chip)

  let current: GuideEntry | null = null
  let open = false
  let enabled = true
  let narrow = false
  let destroyed = false

  const sync = (): void => {
    bubble.hidden = !(enabled && open && current !== null)
    host.classList.toggle('is-open', !bubble.hidden) // 펼쳐져 있는 동안 온실 장면이 옆으로 비켜난다(style.css)
    chip.hidden = !(enabled && !open && current !== null)
  }

  const render = (entry: GuideEntry): void => {
    current = entry
    title.textContent = entry.title
    noteEl.textContent = ''
    scroll.replaceChildren(guideContent(entry, (code, button) => {
      button.disabled = true
      void copyToClipboard(code).then(copied => {
        if (destroyed) return
        button.disabled = false
        hooks.onCopy(code, copied)
      })
    }))
    scroll.scrollTop = 0
  }

  const collapse = (): void => {
    if (!open) return
    const hadFocus = bubble.contains(document.activeElement)
    open = false
    sync()
    if (hadFocus && !chip.hidden) chip.focus()
  }

  ok.addEventListener('click', collapse)
  chip.addEventListener('click', () => {
    if (current === null) return
    render(current)
    open = true
    sync()
    hooks.onShow?.()
    ok.focus()
  })

  const showEntry = (entry: GuideEntry): void => {
    render(entry)
    if (!enabled) return
    open = true
    sync()
    hooks.onShow?.()
  }
  const rememberEntry = (entry: GuideEntry): void => {
    if (open) return
    current = entry
    sync()
  }

  return {
    show: id => showEntry(guideFor(id)),
    remember: id => rememberEntry(guideFor(id)),
    showEntry,
    rememberEntry,
    hide: collapse,
    setEnabled(on) {
      enabled = on
      if (!on) open = false
      sync()
    },
    setNarrow(on) {
      if (on === narrow) return
      narrow = on
      host.classList.toggle('is-narrow', on)
    },
    isOpen: () => enabled && open,
    note(text) { noteEl.textContent = text },
    destroy() {
      destroyed = true
      open = false
      host.classList.remove('is-open', 'is-narrow')
      bubble.remove()
      chip.remove()
    },
  }
}
