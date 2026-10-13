// 화면 틀과 단추에 쓰는 공용 도구. 틀과 단추 그림은 Kenney의 UI Pack: Sci-Fi(회색)이고, 여기에서 만든 필터로 색만 입힌다.

const SVG_NS = 'http://www.w3.org/2000/svg'
const TABLE_STEPS = 20

// 원본 그림의 밝기(0~1)마다 입힐 색. 원본은 바깥 선(0.59), 바탕(0.86), 안쪽 밝은 선(1.0), 단추 아랫단(0.46)으로 되어 있다.
type Tint = { lip: string; edge: string; fill: string; rim: string }

const TINTS: Record<string, Tint> = {
  panel: { lip: '#03080e', edge: '#050c15', fill: '#11253a', rim: '#3a6f8f' }, // 창과 말풍선의 틀
  screen: { lip: '#03080e', edge: '#2a5068', fill: '#0b1622', rim: '#03080e' }, // 안으로 들어간 화면(편집기, 기록)
  steel: { lip: '#03080e', edge: '#0a1826', fill: '#1f4160', rim: '#5f9dc0' }, // 보통 단추
  primary: { lip: '#063a3c', edge: '#06282a', fill: '#18a6a8', rim: '#8ff5ec' }, // 강조 단추
  warn: { lip: '#7a4500', edge: '#4a2a00', fill: '#ffb454', rim: '#ffe3b8' }, // 되돌릴 수 없는 일을 하는 단추
}

const channel = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255

function tableValues(tint: Tint, i: number): string {
  const stops: [number, number][] = [
    [0, channel(tint.lip, i)], [0.5, channel(tint.lip, i)], [0.58, channel(tint.edge, i)], [0.66, channel(tint.edge, i)],
    [0.8, channel(tint.fill, i)], [0.93, channel(tint.fill, i)], [1, channel(tint.rim, i)],
  ]
  const values: string[] = []
  for (let k = 0; k <= TABLE_STEPS; k++) {
    const x = k / TABLE_STEPS
    let at = 0
    while (at < stops.length - 2 && x > stops[at + 1][0]) at++
    const [x0, y0] = stops[at]
    const [x1, y1] = stops[at + 1]
    const t = x1 === x0 ? 0 : Math.min(1, Math.max(0, (x - x0) / (x1 - x0)))
    values.push((y0 + (y1 - y0) * t).toFixed(3))
  }
  return values.join(' ')
}

// style.css의 filter: url(#tint-…)가 가리키는 필터를 문서에 넣는다.
export function installTints(parent: HTMLElement): void {
  const root = document.createElementNS(SVG_NS, 'svg')
  root.setAttribute('class', 'tint-defs')
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('width', '0')
  root.setAttribute('height', '0')
  for (const name in TINTS) {
    const filter = document.createElementNS(SVG_NS, 'filter')
    filter.setAttribute('id', `tint-${name}`)
    filter.setAttribute('color-interpolation-filters', 'sRGB')
    const transfer = document.createElementNS(SVG_NS, 'feComponentTransfer')
    ;['feFuncR', 'feFuncG', 'feFuncB'].forEach((tag, i) => {
      const fn = document.createElementNS(SVG_NS, tag)
      fn.setAttribute('type', 'table')
      fn.setAttribute('tableValues', tableValues(TINTS[name], i))
      transfer.appendChild(fn)
    })
    filter.appendChild(transfer)
    root.appendChild(filter)
  }
  parent.appendChild(root)
}

export type IconName =
  | 'play' | 'stop' | 'step' | 'unlock' | 'manual' | 'gear' | 'close' | 'check' | 'warning' | 'replay' | 'home' | 'trophy'

// 아이콘은 Kenney의 Game Icons 묶음 그림 한 장에서 잘라 쓴다(자리는 style.css의 .ico-*).
export function icon(name: IconName): HTMLElement {
  const e = document.createElement('i')
  e.className = `ico ico-${name}`
  e.setAttribute('aria-hidden', 'true')
  return e
}

// 고정된 HTML 문자열(template) 안에 넣는 아이콘
export const iconHtml = (name: IconName): string => `<i class="ico ico-${name}" aria-hidden="true"></i>`

// 키를 누르고 있어서 생기는 반복 입력으로는 단추가 눌리지 않게 한다. 화면이 바뀌면 새 화면의 단추에 곧바로 초점이
// 놓이므로, 이 처리가 없으면 Enter를 누르고 있는 동안 화면이 연달아 넘어간다.
export function ignoreKeyRepeat(button: HTMLElement): void {
  button.addEventListener('keydown', e => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault()
  })
}

// 앞 화면에서 누르고 있던 키의 반복 입력이 새 화면의 편집기에 글자로 들어가지 않게, 키를 새로 누를 때까지의 반복 입력을 버린다.
// 화면을 만들 때 다른 keydown 처리보다 먼저 부른다.
export function dropCarriedKeyRepeat(signal: AbortSignal): void {
  let carried = true
  document.addEventListener('keydown', e => {
    if (!e.repeat) { carried = false; return }
    if (!carried) return
    e.preventDefault()
    e.stopPropagation()
  }, { capture: true, signal })
}

// 실행 단축키를 사용자의 운영 체제에 맞게 적는다.
export function runShortcutLabel(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent || ''
  return /Mac|iPhone|iPad/.test(platform) ? '⌘+Enter' : 'Ctrl+Enter'
}
