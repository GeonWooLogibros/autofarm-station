import { ITEM_LABEL, PLANT_LABEL } from '../progress/droneApi'
import type { Game } from '../progress/game'
import { plantCostRows } from '../progress/plantCost'
import { waterFacts } from '../progress/waterInfo'
import { FUNCTION_DOCS, GUIDES, type GuideEntry } from '../progress/guide'
import { UNLOCKS, UNLOCK_ORDER, unlockDef, unlockedPlants, type UnlockDef, type UnlockId } from '../progress/unlocks'
import { plantCost } from '../sim/balance'
import type { ItemKind } from '../sim/types'
import { icon } from './chrome'
import { guideContent, h, richText } from './guideBubble'
import { costChips, itemChip, itemIcon } from './items'
import { INT_SPRITES } from './sprites'

export type PanelName = 'unlocks' | 'manual' | 'settings' | 'ending'

export interface Panels {
  open(name: PanelName, opener?: HTMLElement | null): void
  close(): void
  refresh(game: Game): void // 열려 있는 화면의 내용을 갱신한다
  current(): PanelName | null
  destroy(): void // 열려 있는 화면을 닫고 남은 타이머를 정리한다
}

export interface PanelHooks {
  onBuy(id: UnlockId): void
  onSettings(): void
  onReset(): void
}

const REFRESH_MS = 250
const SVG_NS = 'http://www.w3.org/2000/svg'

const PANEL_LABEL: Record<PanelName, string> = {
  unlocks: '해금', manual: '설명서', settings: '설정', ending: '엔딩',
}

// ── 공용 ─────────────────────────────────────────────────
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}시간 ${minutes}분 ${seconds}초`
  if (minutes > 0) return `${minutes}분 ${seconds}초`
  return `${seconds}초`
}

export function affordableCount(game: Game): number {
  let n = 0
  for (const id of UNLOCK_ORDER) if (game.canBuy(id)) n++
  return n
}

const count = (n: number): string => Math.floor(Number.isFinite(n) ? Math.max(0, n) : 0).toLocaleString('ko-KR')

function svg(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(SVG_NS, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  if (parent) parent.appendChild(e)
  return e
}

const costKinds = (def: UnlockDef): ItemKind[] => Object.keys(def.cost) as ItemKind[]
const requiresMet = (game: Game, def: UnlockDef): boolean => def.requires.every(r => game.unlocked.has(r))

// ── 해금 지도의 자리 ───────────────────────────────────────
const CARD_W = 244
const CARD_H = 128
const COL_GAP = 56
const ROW_GAP = 10
const PAD = 12

interface Spot { def: UnlockDef; col: number; x: number; y: number }

function layoutUnlocks(): { spots: Map<UnlockId, Spot>; width: number; height: number } {
  const depth = new Map<UnlockId, number>()
  const depthOf = (id: UnlockId): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    const d = Math.max(-1, ...unlockDef(id).requires.map(depthOf)) + 1
    depth.set(id, d)
    return d
  }
  const columns: UnlockDef[][] = []
  for (const def of UNLOCKS) (columns[depthOf(def.id)] ??= []).push(def)
  const rows = Math.max(...columns.map(c => c.length))
  const height = PAD * 2 + rows * CARD_H + (rows - 1) * ROW_GAP
  const spots = new Map<UnlockId, Spot>()
  columns.forEach((defs, col) => {
    const used = defs.length * CARD_H + (defs.length - 1) * ROW_GAP
    const top = (height - used) / 2
    defs.forEach((def, row) => {
      spots.set(def.id, { def, col, x: PAD + col * (CARD_W + COL_GAP), y: top + row * (CARD_H + ROW_GAP) })
    })
  })
  return { spots, width: PAD * 2 + columns.length * CARD_W + (columns.length - 1) * COL_GAP, height }
}

type CardState = 'bought' | 'buyable' | 'short' | 'locked'
const STATE_TAG: Record<CardState, string> = { bought: '해금함', buyable: '해금하기', short: '자원 부족', locked: '잠김' }

function cardState(game: Game, def: UnlockDef): CardState {
  if (game.unlocked.has(def.id)) return 'bought'
  if (!requiresMet(game, def)) return 'locked'
  return game.canBuy(def.id) ? 'buyable' : 'short'
}

interface View {
  root: HTMLElement // 대화 상자
  refresh(game: Game): void
  focusTarget(): HTMLElement | null
  dispose?(): void // 화면을 닫을 때 남은 타이머를 정리한다
}

// challenge: 과제 화면에서 쓴다. 설명서에는 넘겨받은 항목(과제의 설명과 그 과제에서 쓸 수 있는 것)만 보이고,
// 설정에는 본편에만 있는 항목이 빠진다.
export function createPanels(
  host: HTMLElement, game: Game, hooks: PanelHooks, opts: { challenge?: { entries: GuideEntry[]; waterFacts: string[] } } = {},
): Panels {
  const inChallenge = opts.challenge !== undefined
  const backdrop = h('div', 'panel-backdrop')
  backdrop.hidden = true
  host.append(backdrop)

  let name: PanelName | null = null
  let view: View | null = null
  let opener: HTMLElement | null = null
  let lastRefresh = 0

  const setBackgroundInert = (on: boolean): void => {
    const parent = host.parentElement
    if (!parent) return
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== host && sibling instanceof HTMLElement) sibling.inert = on
    }
  }

  const close = (): void => {
    if (name === null) return
    view?.dispose?.()
    name = null
    view = null
    backdrop.hidden = true
    backdrop.className = 'panel-backdrop'
    backdrop.replaceChildren()
    setBackgroundInert(false)
    const back = opener
    opener = null
    if (back && back.isConnected) back.focus()
  }

  // 바깥을 누르면 닫는다. 안에서 누르기 시작해 바깥에서 뗀 경우는 닫지 않는다.
  let pressedOutside = false
  backdrop.addEventListener('pointerdown', e => { pressedOutside = e.target === backdrop })
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop && pressedOutside) close()
  })
  // 화면이 열려 있는 동안 Tab은 그 안에서만 돈다.
  backdrop.addEventListener('keydown', e => {
    // 키를 누르고 있어서 생기는 반복 입력으로는 화면 안의 어떤 단추도 누르지 않는다. 해금은 한 번 누를 때마다
    // 한 번만 하고, 완전 자동화를 해금한 키를 계속 누르고 있어도 곧바로 뜨는 엔딩 화면이 닫히지 않는다.
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      return
    }
    if (e.key !== 'Tab' || !view) return
    const items = Array.from(view.root.querySelectorAll<HTMLElement>(
      'button, input, summary, [tabindex="0"]',
    )).filter(el => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0)
    if (items.length === 0) { e.preventDefault(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === view.root)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
  })

  function shell(panel: PanelName, title: string, closeLabel = '닫기'): { root: HTMLElement; head: HTMLElement; body: HTMLElement } {
    const root = h('div', `panel frame panel-${panel}`)
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', PANEL_LABEL[panel])
    root.tabIndex = -1
    const head = h('header', 'panel-head')
    head.append(h('h2', '', title))
    const closeBtn = h('button', 'btn panel-close', closeLabel)
    closeBtn.type = 'button'
    closeBtn.prepend(icon('close'))
    closeBtn.addEventListener('click', close)
    head.append(closeBtn)
    const body = h('div', 'panel-body')
    root.append(head, body)
    return { root, head, body }
  }

  // ── 해금 화면 ─────────────────────────────────────────────
  function unlocksView(): View {
    const { root, head, body } = shell('unlocks', '해금')
    const closeBtn = head.lastElementChild!
    // 해금한 항목의 수를 막대와 숫자로 함께 보여 준다.
    const progress = h('span', 'unlock-progress')
    const progressFill = h('i', 'unlock-progress-fill')
    const progressText = h('span', 'unlock-progress-text')
    const progressTrack = h('span', 'unlock-progress-track')
    progressTrack.setAttribute('aria-hidden', 'true')
    progressTrack.append(progressFill)
    progress.append(progressTrack, progressText)
    const wallet = h('div', 'unlock-wallet')
    wallet.setAttribute('aria-label', '가진 자원')
    head.insertBefore(progress, closeBtn)
    head.insertBefore(wallet, closeBtn)

    const sub = h('div', 'unlock-sub')
    const status = h('p', 'unlock-status', '자원을 모아 정거장의 설비를 차례로 해금합니다.')
    status.setAttribute('role', 'status')
    const legend = h('ul', 'unlock-legend')
    legend.setAttribute('aria-label', '표시 설명')
    for (const [cls, text] of [
      ['bought', '해금함'], ['buyable', '지금 해금할 수 있음'], ['short', '자원 부족'], ['locked', '앞 항목을 먼저 해금'],
    ]) {
      const li = h('li', `is-${cls}`)
      li.append(h('i'), text)
      legend.append(li)
    }
    sub.append(status, legend)

    const map = h('div', 'unlock-map')
    const canvas = h('div', 'unlock-canvas')
    const { spots, width, height } = layoutUnlocks()
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const wires = svg('svg', { class: 'unlock-wires', width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' }, canvas)
    map.append(canvas)
    body.append(sub, map)

    // 세로로 넘치지 않을 때에는 마우스 휠로 가로로 움직인다.
    map.addEventListener('wheel', e => {
      if (e.deltaY === 0 || e.shiftKey || map.scrollHeight > map.clientHeight + 1) return
      e.preventDefault()
      map.scrollLeft += e.deltaY
    }, { passive: false })

    interface Card { spot: Spot; el: HTMLButtonElement; tag: HTMLElement; foot: HTMLElement; wire: SVGElement | null; key: string }
    const cards: Card[] = []
    let statusTimer: number | undefined
    const say = (text: string, kind: 'ok' | 'warn'): void => {
      status.textContent = text
      status.className = `unlock-status is-${kind}`
      window.clearTimeout(statusTimer)
      statusTimer = window.setTimeout(() => {
        status.textContent = '자원을 모아 정거장의 설비를 차례로 해금합니다.'
        status.className = 'unlock-status'
      }, 5000)
    }

    const press = (card: Card): void => {
      const def = card.spot.def
      const state = cardState(game, def)
      if (state === 'bought') { say(`'${def.title}' 항목은 이미 해금했습니다.`, 'ok'); return }
      if (state === 'locked') {
        say(`먼저 ${def.requires.map(r => `'${unlockDef(r).title}'`).join(', ')} 항목을 해금해야 합니다.`, 'warn')
        return
      }
      if (state === 'short') {
        const items = game.world.state.items
        const missing = costKinds(def)
          .filter(k => items[k] < (def.cost[k] ?? 0))
          .map(k => `${ITEM_LABEL[k]} ${count(Math.ceil((def.cost[k] ?? 0) - Math.floor(items[k])))}`)
        say(`자원이 부족합니다. 더 모아야 하는 자원: ${missing.join(', ')}`, 'warn')
        return
      }
      hooks.onBuy(def.id)
      if (name !== 'unlocks' || !game.unlocked.has(def.id)) return // 안내나 엔딩으로 넘어갔다
      say(`'${def.title}' 항목을 해금했습니다.`, 'ok')
      card.el.classList.remove('just-bought')
      void card.el.offsetWidth // 애니메이션을 다시 시작한다
      card.el.classList.add('just-bought')
      update(game)
    }

    for (const spot of spots.values()) {
      const def = spot.def
      let wire: SVGElement | null = null
      for (const r of def.requires) {
        const from = spots.get(r)!
        const x1 = from.x + CARD_W
        const y1 = from.y + CARD_H / 2
        const x2 = spot.x
        const y2 = spot.y + CARD_H / 2
        const mid = (x1 + x2) / 2
        wire = svg('path', { d: `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`, class: 'wire' }, wires)
      }
      const el = h('button', 'unlock-card')
      el.type = 'button'
      el.style.left = `${spot.x}px`
      el.style.top = `${spot.y}px`
      el.style.width = `${CARD_W}px`
      el.style.height = `${CARD_H}px`
      const top = h('span', 'unlock-top')
      const tag = h('span', 'unlock-tag')
      top.append(h('span', 'unlock-title', def.title), tag)
      const foot = h('span', 'unlock-foot')
      el.append(top, h('span', 'unlock-summary', def.summary))
      // 작물을 여는 항목에는 그 작물을 심을 때마다 드는 값을 함께 적는다.
      const planting = def.plants.flatMap(plantCost)
      if (planting.length > 0) {
        const line = h('span', 'unlock-plant-cost')
        line.append(h('span', 'unlock-plant-cost-label', '심을 때마다'), ...costChips(planting))
        el.append(line)
      }
      el.append(foot)
      const card: Card = { spot, el, tag, foot, wire, key: '' }
      el.addEventListener('click', () => press(card))
      canvas.append(el)
      cards.push(card)
    }

    let walletKey = ''
    function update(g: Game): void {
      const items = g.world.state.items
      const needed = new Set<ItemKind>(['Daisy'])
      for (const card of cards) {
        const def = card.spot.def
        const state = cardState(g, def)
        const kinds = costKinds(def)
        if (state === 'buyable' || state === 'short') for (const k of kinds) needed.add(k)
        const key = state === 'bought' || state === 'locked'
          ? state
          : `${state}|${kinds.map(k => Math.floor(items[k])).join(',')}`
        if (key === card.key) continue
        card.key = key
        const keep = card.el.classList.contains('just-bought') ? ' just-bought' : ''
        card.el.className = `unlock-card is-${state}${keep}`
        card.el.setAttribute('aria-disabled', String(state !== 'buyable'))
        card.tag.textContent = STATE_TAG[state]
        if (card.wire) card.wire.setAttribute('class', `wire is-${state}`)
        if (state === 'bought') {
          card.foot.replaceChildren()
        } else if (state === 'locked') {
          const names = def.requires.map(r => `'${unlockDef(r).title}'`).join(', ')
          card.foot.replaceChildren(h('span', 'unlock-need', `먼저 ${names} 항목을 해금해야 합니다.`))
        } else {
          card.foot.replaceChildren(...kinds.map(k => {
            const need = def.cost[k] ?? 0
            const lacking = items[k] < need
            const chip = itemChip(k, `${count(items[k])} / ${count(need)}`, lacking ? 'is-short' : 'is-enough')
            if (lacking) chip.append(h('span', 'sr-only', '부족'))
            return chip
          }))
        }
      }
      const progressLabel = `${g.unlocked.size} / ${UNLOCKS.length}`
      if (progressText.textContent !== progressLabel) {
        progressText.textContent = progressLabel
        progressFill.style.width = `${(g.unlocked.size / UNLOCKS.length) * 100}%`
        progressFill.hidden = g.unlocked.size === 0
      }
      const shown = (['Daisy', 'Strawberry', 'Tulip', 'Tomato', 'Power', 'Coin'] as ItemKind[])
        .filter(k => needed.has(k) || items[k] >= 1)
      const nextKey = shown.map(k => `${k}:${Math.floor(items[k])}`).join('|')
      if (nextKey !== walletKey) {
        walletKey = nextKey
        wallet.replaceChildren(...shown.map(k => itemChip(k, count(items[k]), '', true)))
      }
    }
    update(game)

    // 지금 살펴볼 항목(아직 해금하지 않았고 선행 항목은 해금한 것)이 보이는 곳에서 시작한다.
    const frontier = (): Card | null =>
      cards.find(c => c.key.startsWith('buyable')) ?? cards.find(c => c.key.startsWith('short')) ?? null
    // 지금 해금할 수 있는 항목이 있으면 그 항목과 선행 항목이, 없으면 가장 멀리 해금한 항목과 그다음 항목들이 보이게 한다.
    queueMicrotask(() => {
      const cols = (prefix: string): number[] => cards.filter(c => c.key.startsWith(prefix)).map(c => c.spot.col)
      const buyable = cols('buyable')
      const col = buyable.length ? Math.min(...buyable) - 1 : Math.max(0, ...cols('bought'))
      map.scrollLeft = Math.max(0, PAD + col * (CARD_W + COL_GAP) - COL_GAP / 2)
    })

    return {
      root,
      refresh: update,
      focusTarget: () => frontier()?.el ?? null,
      dispose: () => window.clearTimeout(statusTimer),
    }
  }

  // ── 설명서 ────────────────────────────────────────────────
  function manualView(): View {
    const { root, body } = shell('manual', '설명서')
    const tabs = h('div', 'tabs')
    tabs.setAttribute('role', 'tablist')
    const learnedTab = h('button', 'tab', inChallenge ? '쓸 수 있는 것' : '배운 것')
    const functionsTab = h('button', 'tab', '함수 목록')
    const learned = h('div', 'tab-page manual-learned')
    const functions = h('div', 'tab-page manual-functions')
    const pairs: [HTMLButtonElement, HTMLElement, string][] = [[learnedTab, learned, 'learned'], [functionsTab, functions, 'functions']]
    const select = (which: string): void => {
      for (const [tab, page, key] of pairs) {
        const on = key === which
        tab.setAttribute('aria-selected', String(on))
        tab.tabIndex = on ? 0 : -1
        page.hidden = !on
      }
    }
    for (const [tab, page, key] of pairs) {
      tab.type = 'button'
      tab.id = `manual-tab-${key}`
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-controls', `manual-page-${key}`)
      page.id = `manual-page-${key}`
      page.setAttribute('role', 'tabpanel')
      page.setAttribute('aria-labelledby', tab.id)
      tab.addEventListener('click', () => select(key))
      tab.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        e.preventDefault()
        const other = pairs.find(p => p[2] !== key)!
        select(other[2])
        other[0].focus()
      })
      tabs.append(tab)
    }
    body.append(tabs, learned, functions)
    select('learned')

    let key = ''
    const update = (g: Game): void => {
      const next = UNLOCK_ORDER.filter(id => g.unlocked.has(id)).join(',')
      if (next === key && learned.childElementCount > 0) return
      const first = learned.childElementCount === 0
      key = next
      const openIds = new Set(Array.from(learned.querySelectorAll<HTMLDetailsElement>('details[open]')).map(d => d.dataset.id))
      const entries = opts.challenge?.entries ?? GUIDES.filter(e => e.id === 'start' || g.unlocked.has(e.id))
      // 심는 비용: 해금한 작물만, 규칙의 값(PLANT_COST)에서 바로 만든다.
      const costRows = plantCostRows(g.unlocked)
      const costs = h('section', 'plant-costs')
      if (costRows.length > 0) {
        const heading = h('h3', 'manual-heading', '심는 비용')
        const list = h('ul', 'plant-cost-list')
        for (const row of costRows) {
          const li = h('li')
          const arrow = h('span', 'plant-cost-arrow', '←')
          arrow.setAttribute('aria-hidden', 'true')
          li.append(itemChip(row.plant, '', 'is-plant', true), arrow, h('span', 'sr-only', '심을 때마다'), ...costChips(row.cost))
          list.append(li)
        }
        costs.append(
          heading,
          h('p', 'plant-cost-note', '작물을 한 번 심을 때마다 모아 둔 자원을 씁니다. 자원이 모자라면 심지 못합니다. 데이지는 빈 화분에 저절로 피므로 값이 들지 않습니다.'),
          list,
        )
      }
      // 물: 물주기를 해금한 뒤에만, 규칙의 값에서 만든 문장으로 보여 준다.
      const notes = h('div', 'manual-notes')
      if (costRows.length > 0) notes.append(costs)
      if (g.unlocked.has('watering')) {
        const water = h('section', 'water-notes')
        const heading = h('h3', 'manual-heading', '물')
        heading.prepend(itemIcon('Water'))
        const list = h('ul', 'water-note-list')
        for (const fact of opts.challenge?.waterFacts ?? waterFacts()) {
          const li = h('li')
          li.append(richText(fact))
          list.append(li)
        }
        water.append(heading, list)
        notes.append(water)
      }
      learned.replaceChildren(
        h('p', 'manual-hint', inChallenge
          ? '이 과제에서 쓸 수 있는 내용입니다. 항목을 누르면 설명과 예제를 볼 수 있습니다.'
          : '지금까지 배운 내용입니다. 항목을 누르면 설명과 예제를 다시 볼 수 있습니다.'),
        ...(notes.childElementCount > 0 ? [notes] : []),
        ...entries.map((entry, i) => {
          const details = h('details', 'manual-entry')
          details.dataset.id = entry.id
          // 처음 열 때: 항목이 하나뿐이면 펼쳐 두고, 과제에서는 맨 위의 과제 설명을 펼쳐 둔다.
          details.open = first ? entries.length === 1 || (inChallenge && i === 0) : openIds.has(entry.id)
          const summary = h('summary')
          summary.append(h('span', 'manual-index', String(i + 1).padStart(2, '0')), h('span', 'manual-title', entry.title))
          details.append(summary, guideContent(entry))
          return details
        }),
      )

      const usable = FUNCTION_DOCS.filter(d => d.unlock === null || g.unlocked.has(d.unlock))
      // 쓸 수 있는 함수를 먼저, 잠긴 함수는 이름을 숨겨 그 뒤에 보여 준다.
      const list = h('ul', 'fn-list')
      for (const doc of usable) {
        const li = h('li', 'fn-row')
        const desc = h('p', 'fn-desc')
        desc.append(richText(doc.desc))
        li.append(h('code', 'fn-sig', doc.signature), desc)
        list.append(li)
      }
      if (!inChallenge) {
        for (let i = usable.length; i < FUNCTION_DOCS.length; i++) {
          list.append(h('li', 'fn-row is-locked', '??? — 아직 해금하지 않았습니다.'))
        }
      }

      const groups: [string, string, [string, string][]][] = []
      if (g.unlocked.has('expand1')) {
        groups.push(['방향', '드론이 움직이거나 살펴볼 방향입니다.', [['Right', '오른쪽'], ['Left', '왼쪽'], ['Up', '위'], ['Down', '아래']]])
      }
      const plants = [...unlockedPlants(g.unlocked)]
      const countable = g.unlocked.has('var') // 자원의 수를 세는 함수를 쓸 수 있다
      groups.push([
        '작물',
        countable ? '온실에서 기를 수 있는 작물입니다. 수확해서 모은 자원의 이름으로도 씁니다.' : '온실에서 기를 수 있는 작물입니다.',
        plants.map(p => [p, PLANT_LABEL[p]]),
      ])
      if (countable) {
        const resources: ItemKind[] = []
        if (g.unlocked.has('sunflower')) resources.push('Power')
        if (g.unlocked.has('crate')) resources.push('Coin')
        if (g.unlocked.has('watering')) resources.push('Water')
        if (resources.length) groups.push(['그 밖의 자원', '작물이 아닌 자원입니다.', resources.map(r => [r, ITEM_LABEL[r]])])
      }
      const consts = h('div', 'const-groups')
      for (const [title, note, names] of groups) {
        const group = h('section', 'const-group')
        const heading = h('h4', '', title)
        heading.append(h('small', '', note))
        const row = h('ul', 'const-list')
        for (const [code, label] of names) {
          const li = h('li')
          li.append(h('code', 'inline-code', code), label)
          row.append(li)
        }
        group.append(heading, row)
        consts.append(group)
      }
      functions.replaceChildren(
        h('h3', 'manual-heading', inChallenge
          ? `사용할 수 있는 함수 ${usable.length}개`
          : `사용할 수 있는 함수 ${usable.length}개 (전체 ${FUNCTION_DOCS.length}개)`),
        list,
        h('h3', 'manual-heading', '사용할 수 있는 이름'),
        consts,
      )
    }
    update(game)
    return { root, refresh: update, focusTarget: () => learnedTab }
  }

  // ── 설정 ─────────────────────────────────────────────────
  function settingsView(): View {
    const { root, body } = shell('settings', '설정')
    const toggle = (label: string, note: string, key: 'guide' | 'sound'): HTMLInputElement => {
      const row = h('label', 'setting-row')
      const input = h('input')
      input.type = 'checkbox'
      input.checked = game.settings[key]
      input.addEventListener('change', () => {
        game.settings[key] = input.checked
        hooks.onSettings()
      })
      const text = h('span', 'setting-text')
      text.append(h('span', 'setting-name', label), h('small', '', note))
      row.append(input, text)
      body.append(row)
      return input
    }
    const guide = toggle('안내 보기', inChallenge
      ? '과제를 처음 열면 인트가 말풍선으로 설명합니다. 이 과제를 하는 동안에만 적용됩니다.'
      : '항목을 해금하면 인트가 말풍선으로 설명합니다. 꺼도 설명서에서 다시 볼 수 있습니다.', 'guide')
    const sound = toggle('소리 켜기', inChallenge
      ? '수확 같은 효과음을 재생합니다. 이 과제를 하는 동안에만 적용됩니다.'
      : '수확, 해금 같은 효과음을 재생합니다.', 'sound')

    const time = h('div', 'setting-row setting-time')
    const timeValue = h('strong')
    time.append(h('span', 'setting-name', '플레이 시간'), timeValue)
    if (!inChallenge) body.append(time)

    const danger = h('div', 'setting-reset')
    const askReset = (): void => {
      const start = h('button', 'btn reset-start', '처음부터 다시 시작하기')
      start.type = 'button'
      start.addEventListener('click', confirmReset)
      danger.replaceChildren(start)
    }
    const confirmReset = (): void => {
      const text = h('p', 'reset-warning', '본편의 진행 상황과 코드가 지워집니다. 도전 과제의 기록은 남습니다. 정말 다시 시작하시겠습니까?')
      text.setAttribute('role', 'alert')
      const yes = h('button', 'btn danger', '다시 시작하기')
      yes.type = 'button'
      yes.addEventListener('click', () => hooks.onReset())
      const no = h('button', 'btn', '취소')
      no.type = 'button'
      no.addEventListener('click', () => {
        askReset()
        danger.querySelector('button')?.focus()
      })
      const row = h('div', 'reset-buttons')
      row.append(no, yes)
      danger.replaceChildren(text, row)
      no.focus()
    }
    askReset()
    if (!inChallenge) body.append(danger)

    let shownTime = ''
    const update = (g: Game): void => {
      const next = formatDuration(g.playMs)
      if (next !== shownTime) { shownTime = next; timeValue.textContent = next }
      if (guide.checked !== g.settings.guide) guide.checked = g.settings.guide
      if (sound.checked !== g.settings.sound) sound.checked = g.settings.sound
    }
    update(game)
    return { root, refresh: update, focusTarget: () => guide }
  }

  // ── 엔딩 ─────────────────────────────────────────────────
  function endingView(): View {
    const root = h('div', 'panel frame panel-ending')
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', PANEL_LABEL.ending)
    root.tabIndex = -1

    const int = h('img', 'ending-int')
    int.src = INT_SPRITES.action
    int.alt = ''
    const stats = h('dl', 'ending-stats')
    const stat = (label: string, value: Node): void => {
      const row = h('div')
      const dd = h('dd')
      dd.append(value)
      row.append(h('dt', '', label), dd)
      stats.append(row)
    }
    const items = game.world.state.items
    const held = h('span', 'ending-items')
    const kinds = (['Daisy', 'Strawberry', 'Tulip', 'Tomato', 'Power', 'Coin'] as ItemKind[]).filter(k => items[k] >= 1)
    if (kinds.length) held.append(...kinds.map(k => itemChip(k, count(items[k]), '', true)))
    else held.textContent = '없음'
    stat('걸린 시간', h('strong', 'ending-time', formatDuration(game.finishedAtMs ?? game.playMs)))
    stat('해금한 항목', document.createTextNode(`${game.unlocked.size} / ${UNLOCKS.length}`))
    stat('보유 자원', held)

    const again = h('button', 'btn btn-lg primary', '계속 플레이하기')
    again.type = 'button'
    again.addEventListener('click', close)
    root.append(
      int,
      h('p', 'ending-kicker', '완전 자동화 달성'),
      h('h2', '', '온실이 완전히 자동화되었습니다'),
      h('p', 'ending-text', '이제 정원사는 필요하지 않습니다. 드론이 온실을 돌보는 동안 편히 쉬어도 좋습니다.'),
      stats,
      again,
    )
    return { root, refresh: () => {}, focusTarget: () => again }
  }

  const BUILDERS: Record<PanelName, () => View> = {
    unlocks: unlocksView, manual: manualView, settings: settingsView, ending: endingView,
  }

  return {
    open(panel, from) {
      // 닫을 때 초점을 돌려줄 곳. 다른 화면에서 넘어온 경우(해금 → 엔딩)에는 처음 화면을 연 단추를 그대로 둔다.
      if (name === null) {
        opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
      }
      view?.dispose?.()
      name = panel
      view = BUILDERS[panel]()
      backdrop.className = `panel-backdrop for-${panel}`
      backdrop.replaceChildren(view.root)
      backdrop.hidden = false
      setBackgroundInert(true)
      lastRefresh = performance.now()
      ;(view.focusTarget() ?? view.root).focus()
    },
    close,
    refresh(g) {
      if (!view) return
      const now = performance.now()
      if (now - lastRefresh < REFRESH_MS) return
      lastRefresh = now
      view.refresh(g)
    },
    current: () => name,
    destroy() {
      opener = null // 떠나는 화면의 단추로 초점을 돌려주지 않는다
      close()
      backdrop.remove()
    },
  }
}
