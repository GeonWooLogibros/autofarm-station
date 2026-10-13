import { ITEM_LABEL } from '../progress/droneApi'
import type { CostEntry, ItemKind } from '../sim/types'
import { CRATE_SPRITES, DROP_SPRITE, PLANT_SPRITES } from './sprites'

const SVG_NS = 'http://www.w3.org/2000/svg'

function svg(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(SVG_NS, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  if (parent) parent.appendChild(e)
  return e
}

function span(className: string, text = ''): HTMLSpanElement {
  const e = document.createElement('span')
  e.className = className
  if (text) e.textContent = text
  return e
}

// 온실 화물칸과 같은 그림을 쓴다.
export function itemIcon(kind: ItemKind): Element {
  if (kind === 'Power' || kind === 'Coin') {
    const root = svg('svg', { viewBox: '-18 -18 36 36', class: 'item-icon', 'aria-hidden': 'true' })
    if (kind === 'Power') {
      svg('circle', { r: 17, fill: '#0f4b4f', stroke: '#2dd4c8', 'stroke-width': 1.5 }, root)
      svg('path', { d: 'M3 -13 L-8 2 L-1 2 L-4 13 L8 -3 L1 -3 Z', fill: '#ffd447' }, root)
    } else {
      svg('circle', { r: 15, fill: '#f6b61e' }, root)
      svg('circle', { r: 11, fill: '#ffd447', stroke: '#e09a06', 'stroke-width': 1.5 }, root)
      svg('rect', { x: -2, y: -6, width: 4, height: 12, rx: 1.5, fill: '#e09a06' }, root)
    }
    return root
  }
  const img = document.createElement('img')
  img.className = 'item-icon'
  img.alt = ''
  img.src = kind === 'Crate' ? CRATE_SPRITES[3] : kind === 'Water' ? DROP_SPRITE : PLANT_SPRITES[kind][2]
  return img
}

// 그림과 수. named가 참이면 이름도 보이게 적고, 아니면 화면 낭독기에만 읽힌다. text가 비어 있으면 수를 적지 않는다.
export function itemChip(kind: ItemKind, text: string, extraClass = '', named = false): HTMLElement {
  const chip = span(`item-chip ${extraClass}`.trim())
  chip.title = ITEM_LABEL[kind]
  chip.append(itemIcon(kind), span(named ? 'item-name' : 'sr-only', ITEM_LABEL[kind]))
  if (text) chip.append(span('item-num', text))
  return chip
}

// 심을 때 내는 자원을 '그림 이름 수'로 늘어놓는다.
export function costChips(cost: CostEntry[]): HTMLElement[] {
  return cost.map(c => itemChip(c.item, String(c.amount), 'is-cost', true))
}
