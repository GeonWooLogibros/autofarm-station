import { ITEM_LABEL } from '../progress/droneApi'
import type { Game } from '../progress/game'
import { shortageText } from '../progress/plantCost'
import { MOISTURE_STEPS, moistureSteps, refillCaption } from '../progress/waterInfo'
import { WATER_FILL_MS } from '../sim/balance'
import { unlockedPlants } from '../progress/unlocks'
import { isCrateSorted } from '../sim/rules'
import type { Dir, ItemKind, PlantKind, WorldEvent, WorldState } from '../sim/types'
import type { Audio } from './audio'
import {
  CRATE_SPRITES, DRONE_SPRITES, DROP_SPRITE, PLANT_SPRITES, POT_SHADOW_SPRITE, POT_SPRITE, SEED_SPRITE,
  INT_SPRITES, TRUCK_SPRITES, crateSprite, plantStage,
} from './sprites'

export interface GreenhouseExtra { income?: Partial<Record<ItemKind, number>>; cargo?: readonly ItemKind[] }

export interface Greenhouse {
  // extra.income을 주면 자원 칸의 수 아래에 분당 수확량을 적는다(본편에서만 준다).
  // extra.cargo를 주면 해금 상태와 상관없이 그 자원의 칸만 보인다(과제 화면에서만 준다).
  render(game: Game, events: WorldEvent[], dtMs: number, extra?: GreenhouseExtra): void
  destroy(): void // 장면을 떼어 낸다. 그 뒤의 render는 아무 일도 하지 않는다
}

type Crop = Exclude<PlantKind, 'Crate'>
type Attrs = Record<string, string | number>

const NS = 'http://www.w3.org/2000/svg'
// 장면의 좌표 크기는 창의 가로세로 비율을 따라간다(chooseView). 가로로 긴 창에서는 너비가, 세로로 긴 창에서는 높이가 늘어난다.
// 이 범위를 벗어나는 비율에서는 남는 자리를 벽과 바닥으로 채운다.
const BASE_H = 720
const MIN_W = 440
const MAX_W = 1400
const MAX_H = 1100
const MIN_SCALE = 0.75 // 장면을 이보다 작게 줄여 그리지는 않는다(천장 띠의 단추와 바닥의 글자가 읽혀야 한다).
const MAX_CELL = 176 // 작은 선반에서 그림이 지나치게 커지지 않게 한다.
const MAX_SIDE = 12
const CEILING_Y = 44 // 천장 띠의 높이. '안내 다시 보기' 단추가 이 띠 안에 놓인다.
const FLOOR_H = 142 // 바닥(출하장)의 높이. 화물칸에 그림, 수, 분당 수확량, 이름의 네 줄이 들어간다.
const GRID_TOP = CEILING_Y + 52 // 선반이 올라갈 수 있는 가장 높은 곳. 그 위에 배관과 재배등이 있다.
const SHELF_SIDE = 64 // 선반과 화면 가장자리 사이에 남기는 최소 너비
const MIN_BENCH = 12 // 선반 아래 받침의 최소 높이
const MAX_BENCH = 150 // 작은 선반을 올려 두는 작업대의 최대 높이

// 출하장: 트럭, 화물칸, 물탱크가 같은 높이와 같은 밑변으로 한 줄에 놓인다.
const ROW = { top: 12, bottom: 10, h: FLOOR_H - 22, gap: 10, minGap: 6, tile: 74, minTile: 58, tank: 112, margin: 16 }
const TRUCK_RATIO = 280 / 286 // 트럭 그림의 너비 / 높이
const WINDOW_R = 58
const TANK = { x: 10, y: 10, w: 26, h: ROW.h - 36 } // 물탱크 틀 안의 수위 표시(틀의 왼쪽 위 기준). 그 아래에 충전 주기를 적는다.
const REFILL_STEPS = 40 // 다음 물이 채워지기까지의 진행을 이만큼의 단계로 나누어 그린다.
const RING_R = 16
// 화물칸 안의 자리(칸의 윗변 기준)
const SLOT = { icon: 29, count: 73, label: ROW.h - 9 }
// 분당 수확량 글자는 화면에서 14px보다 작아지지 않게, 장면이 줄어든 만큼 키운다.
const INCOME_PX = 14
const INCOME_MAX = 19
const FRAME = { edge: '#050c15', rim: '#3a6f8f', fill: '#11253a', inset: '#081522' } // 화면 틀(style.css)과 같은 색

const MAX_EFFECTS = 80
const MAX_FLY_PER_HARVEST = 36
const MAX_NEW_EFFECTS_PER_FRAME = 60
// 심는 값을 보여 주는 효과
const MAX_FLY_PER_COST = 3 // 자원 한 가지에서 화분으로 날아가는 그림의 수
const MAX_POPS_PER_TILE = 3 // 화물칸 하나에 동시에 떠 있는 '−N'의 수
const SHORT_LABEL_MS = 1200 // '…가 부족합니다' 문구가 떠 있는 시간
const SHORT_REPEAT_MS = 2000 // 같은 화분, 같은 화물칸에서 부족 표시를 다시 보여 주기까지의 간격
const SHORT_LABEL_GAP_MS = 1500 // 어느 화분에서든 부족 문구를 하나 띄운 뒤 다음 문구까지의 간격. 문구는 한 번에 하나만 보인다.

// 그림 원본 크기(assets/SOURCES.md의 배치 메모)
const PLANT_DIM: Record<Crop, [number, number][]> = {
  Daisy: [[21, 11], [26, 23], [45, 34]],
  Strawberry: [[17, 12], [30, 19], [51, 32]],
  Sunflower: [[22, 12], [28, 30], [30, 41]],
  Tomato: [[16, 10], [31, 24], [39, 35]],
  Tulip: [[11, 10], [22, 28], [27, 38]],
}
const POT_DIM = { w: 43, h: 38 }
const SHADOW_DIM = { w: 36, h: 14 }
const SEED_DIM = { w: 5, h: 4 }
const CRATE_DIM = { w: 160, h: 94 }
const DRONE_DIM = { w: 158, h: 112, loadedH: 137 }
// 프로펠러 중심(기본 드론 그림의 너비·높이에 대한 비율)과 반지름(너비에 대한 비율). 화면에서 맞춰 본 값이다.
const ROTORS: [number, number, number][] = [
  [0.07, 0.295, 0.085], [0.155, 0.165, 0.06], [0.845, 0.165, 0.06], [0.93, 0.295, 0.085],
]

const SOIL_DRY = [0x8a, 0x6a, 0x4a]
const SOIL_WET = [0x4a, 0x35, 0x24]
const ORANGE = '#ff9f1c'
const WARN = '#ffb454' // style.css의 --warn
const PIP_ON = '#6cc4ff'
const PIP_OFF = '#1d3346'
const TEAL = '#2dd4c8'
const INK = '#0b1622'

const DELTA: Record<Dir, [number, number]> = { Right: [1, 0], Left: [-1, 0], Up: [0, 1], Down: [0, -1] }
const CARGO_ORDER: ItemKind[] = ['Daisy', 'Strawberry', 'Tulip', 'Power', 'Tomato', 'Coin', 'Crate']

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  if (parent) parent.appendChild(e)
  return e
}

const r2 = (v: number): number => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback)

function soilColor(level: number): string {
  const t = clamp(level / 10, 0, 1)
  const ch = (i: number) => Math.round(lerp(SOIL_DRY[i], SOIL_WET[i], t)).toString(16).padStart(2, '0')
  return `#${ch(0)}${ch(1)}${ch(2)}`
}

// 1,000 이상은 '1.2천', 10,000 이상은 '1.2만'으로 줄여 쓴다. 실제보다 많아 보이지 않도록 버림한다.
export function formatCount(value: number): string {
  const n = Math.max(0, Math.floor(finite(value, 0)))
  if (n < 1000) return String(n)
  const short = (unit: number) => {
    const v = Math.floor((n / unit) * 10) / 10
    return v >= 100 ? String(Math.floor(v)) : String(v)
  }
  if (n < 10_000) return `${short(1000)}천`
  if (n < 100_000_000) return `${short(10_000)}만`
  return `${short(100_000_000)}억`
}

function show(node: Element, on: boolean): void {
  if (on) node.removeAttribute('display')
  else node.setAttribute('display', 'none')
}

function pop(node: Element, frames: Keyframe[], duration: number): void {
  if (typeof node.animate !== 'function') return
  try { node.animate(frames, { duration, easing: 'ease-out' }) } catch { /* 꾸밈 효과이므로 무시한다 */ }
}

interface Layout {
  w: number; h: number
  c: number // 칸 크기
  gx: number; gy: number // 격자의 왼쪽 위
  floorY: number // 바닥 선
  bench: number // 선반 아래 받침(작업대)의 높이
  lampY: number // 재배등의 윗변
  board: number // 선반 판 두께
  pot: number // 화분 배율
  plant: number // 식물 배율
  droneW: number; droneH: number
}

// 출하장 한 줄이 가장 좁아졌을 때의 너비. 장면은 이보다 좁아지지 않는다.
export function rowMinWidth(kinds: number, tankOn: boolean): number {
  const gaps = kinds + (tankOn ? 1 : 0)
  return ROW.h * TRUCK_RATIO + (tankOn ? ROW.tank : 0) + kinds * ROW.minTile + gaps * ROW.minGap + ROW.margin * 2
}

// 창(가로 paneW, 세로 paneH 픽셀)에 맞는 장면의 좌표 크기를 고른다.
// 기본은 높이 720에 창의 비율대로 너비를 정하는 것이다. 말풍선이 옆에 붙어 창이 세로로 길어졌을 때처럼
// 선반이 너비에 눌려 작아지는 경우에만, 화면의 칸이 뚜렷이(15% 넘게) 커지는 더 높은 장면을 고른다.
export function chooseView(paneW: number, paneH: number, w: number, h: number, minW: number): { w: number; h: number } {
  if (!(paneW > 0) || !(paneH > 0)) return { w: 960, h: BASE_H }
  const ratio = paneW / paneH
  const low = clamp(Math.ceil(minW), MIN_W, MAX_W)
  const at = (viewW: number) => {
    const viewH = clamp(Math.round(viewW / ratio), BASE_H, MAX_H)
    const scale = Math.min(paneW / viewW, paneH / viewH)
    return { w: viewW, h: viewH, scale, cell: scale * makeLayout(w, h, viewW, viewH).c }
  }
  let pick = at(clamp(Math.round(BASE_H * ratio), low, MAX_W))
  const limit = pick.cell * 1.15
  for (let viewW = low; viewW <= MAX_W; viewW += 20) {
    const next = at(viewW)
    if (next.scale >= MIN_SCALE && next.cell > Math.max(limit, pick.cell)) pick = next
  }
  return { w: pick.w, h: pick.h }
}

// 선반은 화면 가운데에서 바닥을 딛고 선다. 선반이 작아 위아래가 남으면 그 절반까지를 작업대로 받쳐 올린다.
export function makeLayout(w: number, h: number, viewW: number, viewH: number): Layout {
  const floorY = viewH - FLOOR_H
  const room = floorY - MIN_BENCH - GRID_TOP
  const c = Math.min((viewW - SHELF_SIDE * 2) / w, room / h, MAX_CELL)
  const bench = MIN_BENCH + Math.min(MAX_BENCH - MIN_BENCH, (room - c * h) / 2)
  const droneW = c * 0.56
  const gy = floorY - bench - c * h
  return {
    w, h, c,
    gx: (viewW - c * w) / 2,
    gy,
    floorY,
    bench,
    lampY: gy - 36,
    board: c >= 100 ? 8 : 6,
    pot: (c * 0.38) / POT_DIM.w,
    plant: c * 0.0105,
    droneW,
    droneH: (droneW * DRONE_DIM.h) / DRONE_DIM.w,
  }
}

interface CellView {
  content: SVGGElement
  shadow: SVGImageElement
  pot: SVGImageElement
  soil: SVGEllipseElement
  wet: SVGImageElement
  pips: SVGGElement
  pipDots: SVGRectElement[]
  plantWrap: SVGGElement
  plant: SVGImageElement
  crate: SVGImageElement
  line: SVGRectElement
  badge: SVGGElement
  badgeCircle: SVGCircleElement
  badgeText: SVGTextElement
  // 직전에 그린 상태
  kind: PlantKind | null | undefined
  stage: number
  wilted: boolean
  value: number
  sorted: boolean
  moist: number
  steps: number // 수분 칸 가운데 채워진 수
  // swap으로 미끄러지는 중이면 남은 거리와 경과 시간
  slideX: number
  slideY: number
  slideMs: number
}

interface Effect {
  node: SVGElement
  age: number
  delay: number
  life: number
  step(p: number): void
  done?: () => void
}

// 바닥 한 줄에 놓인 칸(화물칸, 물탱크)에서 효과를 띄울 때 쓰는 자리와 상태
interface Tile {
  text: SVGTextElement
  cx: number; top: number; width: number // 장면 좌표에서의 자리(윗변의 가운데와 너비)
  popX: number // '−N'이 뜨는 자리(가운데에서 오른쪽으로 떨어진 거리)
  pops: number // 떠 있는 '−N'의 수
  shortAt: number // 마지막으로 부족 표시를 한 시각. 아직 없으면 음수
}

interface Slot extends Tile {
  g: SVGGElement
  plates: SVGRectElement[] // 너비에 맞춰 늘이는 틀
  shown: number // 직전에 표시한 수(내림한 값). -1이면 아직 그리지 않았다.
  income: SVGTextElement
  incomeKey: string // 직전에 그린 분당 수확량의 내용과 크기
  index: number // 놓인 자리. -1이면 숨김
}

export function createGreenhouse(parent: HTMLElement, audio?: Audio): Greenhouse {
  const root = el('svg', {
    viewBox: `0 0 960 ${BASE_H}`, preserveAspectRatio: 'xMidYMid meet', class: 'greenhouse', role: 'img',
    'aria-label': '온실',
  })
  const defs = el('defs', {}, root)
  const bgLayer = el('g', { class: 'gh-bg' }, root)
  const shelfLayer = el('g', { class: 'gh-shelf' }, root)
  const markLayer = el('g', { class: 'gh-mark' }, root)
  const cellLayer = el('g', { class: 'gh-cells' }, root)
  const droneLayer = el('g', { class: 'gh-drone-layer' }, root)
  const floorLayer = el('g', { class: 'gh-floor' }, root)
  const fxLayer = el('g', { class: 'gh-fx' }, root)

  const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

  // 그림을 미리 받아 두어, 단계가 바뀔 때 깜박이지 않게 한다.
  for (const url of [
    ...Object.values(PLANT_SPRITES).flat(), ...CRATE_SPRITES, SEED_SPRITE, POT_SPRITE, POT_SHADOW_SPRITE, DROP_SPRITE,
    DRONE_SPRITES.idle, DRONE_SPRITES.loaded, TRUCK_SPRITES.open,
  ]) {
    try { new Image().src = url } catch { /* 미리 받기에 실패해도 그림은 나중에 뜬다 */ }
  }

  // 장면의 크기를 창에 맞춘다. 창의 크기는 여기에 적어 두기만 하고, 다음 그리기에서 선반과 바닥을 다시 놓는다.
  const view = { w: 960, h: BASE_H }
  const pane = { w: 0, h: 0 }
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(entries => {
      const box = entries[entries.length - 1]?.contentRect
      if (!box || !(box.width > 0) || !(box.height > 0)) return
      pane.w = box.width
      pane.h = box.height
    })
    : null
  observer?.observe(parent)

  // ── 선반과 칸 ──────────────────────────────────────────────
  let L = makeLayout(1, 1, view.w, view.h)
  let cells: CellView[] = []
  let sliding: CellView[] = []
  let built = false
  let fresh = true // 방금 새로 만든 칸은 커지는 애니메이션 없이 바로 그린다.

  const markGlow = el('ellipse', { fill: TEAL, opacity: 0.32 }, markLayer)
  const markStrip = el('rect', { fill: TEAL, rx: 2 }, markLayer)
  let markKey = ''

  const cellX = (x: number): number => L.gx + (x + 0.5) * L.c
  const cellBase = (y: number): number => L.gy + (L.h - y) * L.c - L.board
  const droneY = (y: number): number => L.gy + (L.h - 1 - y) * L.c + L.droneH / 2 - L.c * 0.115
  const inGrid = (x: number, y: number): boolean =>
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < L.w && y < L.h

  function buildShelf(w: number, h: number): void {
    L = makeLayout(w, h, view.w, view.h)
    defs.replaceChildren()
    bgLayer.replaceChildren()
    buildDefs(defs, L, view.h)
    buildBackground(bgLayer, L, view.w)
    cargoKey = '' // 출하장의 자리를 다시 잡는다.
    shelfLayer.replaceChildren()
    cellLayer.replaceChildren()
    cells = []
    sliding = []
    markKey = ''
    fresh = true

    buildShelfFrame(shelfLayer, L)

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(buildCell(x, y))
    built = true
  }

  function buildCell(x: number, y: number): CellView {
    const { c, pot } = L
    const g = el('g', { transform: `translate(${r2(cellX(x))} ${r2(cellBase(y))})` }, cellLayer)
    const potW = POT_DIM.w * pot
    const potH = POT_DIM.h * pot
    const shadowW = SHADOW_DIM.w * pot * 1.15
    const shadowH = SHADOW_DIM.h * pot * 0.7
    const shadow = el('image', {
      href: POT_SHADOW_SPRITE, x: r2(-shadowW / 2), y: r2(-shadowH * 0.6), width: r2(shadowW), height: r2(shadowH),
      preserveAspectRatio: 'none', opacity: 0.55,
    }, g)
    const content = el('g', {}, g)
    const potImg = el('image', { href: POT_SPRITE, x: r2(-potW / 2), y: r2(-potH), width: r2(potW), height: r2(potH) }, content)
    const soil = el('ellipse', { cx: 0, cy: r2(-potH + 6.3 * pot), rx: r2(17.2 * pot), ry: r2(4.3 * pot), fill: soilColor(0) }, content)
    // 젖은 흙은 색만으로는 작은 화면에서 알아보기 어려워, 화분 앞에 물방울을 함께 보여 준다.
    const wetW = c * 0.085
    const wet = el('image', {
      href: DROP_SPRITE, x: r2(-wetW / 2), y: r2(-potH * 0.62), width: r2(wetW), height: r2(wetW * 31 / 21), visibility: 'hidden',
    }, content)
    // 수분을 네 칸으로 보여 준다. water() 한 번에 한 칸이 차고, 마르면서 한 칸씩 꺼진다.
    const pips = el('g', { visibility: 'hidden', class: 'gh-pips' }, content)
    const pipW = potW * 0.13
    const pipGap = potW * 0.045
    const pipH = Math.max(2, c * 0.024)
    const pipsW = MOISTURE_STEPS * pipW + (MOISTURE_STEPS - 1) * pipGap
    const pipDots: SVGRectElement[] = []
    for (let i = 0; i < MOISTURE_STEPS; i++) {
      pipDots.push(el('rect', {
        x: r2(-pipsW / 2 + i * (pipW + pipGap)), y: r2(-potH * 0.2), width: r2(pipW), height: r2(pipH), rx: r2(pipH / 2), fill: PIP_OFF,
      }, pips))
    }
    // 식물과 상자 가운데 보이지 않는 쪽은 display로 숨긴다. visibility로 숨기면 묶음의 상자 크기에 계속 포함되어,
    // 커지는 애니메이션의 기준점(묶음의 아래 가운데)이 어긋난다.
    const plantWrap = el('g', { class: 'gh-plant' }, content)
    const plant = el('image', { display: 'none' }, plantWrap)
    const crateW = c * 0.8
    const crateH = (crateW * CRATE_DIM.h) / CRATE_DIM.w
    const crate = el('image', { x: r2(-crateW / 2), y: r2(-crateH), width: r2(crateW), height: r2(crateH), display: 'none' }, plantWrap)
    const line = el('rect', { x: r2(-crateW / 2), y: 0.5, width: r2(crateW), height: 3.5, rx: 1.5, fill: ORANGE, visibility: 'hidden' }, content)
    const badge = el('g', { visibility: 'hidden' }, content)
    const badgeCircle = el('circle', { r: r2(c * 0.14), fill: '#ffffff', stroke: INK, 'stroke-width': 2 }, badge)
    const badgeText = el('text', {
      'text-anchor': 'middle', dy: '0.36em', 'font-size': r2(c * 0.21), fill: INK, class: 'gh-num',
    }, badge)
    return {
      content, shadow, pot: potImg, soil, wet, pips, pipDots, plantWrap, plant, crate, line, badge, badgeCircle, badgeText,
      kind: undefined, stage: -1, wilted: false, value: -1, sorted: true, moist: 0, steps: 0,
      slideX: 0, slideY: 0, slideMs: -1,
    }
  }

  function updateCell(view: CellView, s: WorldState, x: number, y: number, animate: boolean): void {
    const cell = s.cells[y * s.w + x]
    if (!cell) return
    const kind = cell.plant
    const isCrate = kind === 'Crate'
    const crop = kind !== null && !isCrate && PLANT_SPRITES[kind] ? kind : null
    const stage = isCrate ? 3 : crop ? plantStage(cell.growth) : -1
    const wilted = crop === 'Tomato' && stage === 3 && cell.wilted === true
    const value = clamp(Math.floor(finite(cell.value, 0)), 0, 99)
    const sorted = isCrate ? isCrateSorted(s, x, y) : true
    const moist = Math.round(clamp(finite(cell.water, 0), 0, 1) * 10)
    const { c, pot } = L
    const potH = POT_DIM.h * pot

    const steps = moistureSteps(cell.water)
    if (moist !== view.moist || steps !== view.steps) {
      const more = animate && steps > view.steps
      view.moist = moist
      view.steps = steps
      view.soil.setAttribute('fill', soilColor(moist))
      const wetShown = moist >= 1 && !isCrate ? 'visible' : 'hidden'
      view.wet.setAttribute('visibility', wetShown)
      view.wet.setAttribute('opacity', String(r2(0.45 + 0.055 * moist)))
      view.pips.setAttribute('visibility', wetShown)
      view.pipDots.forEach((dot, i) => dot.setAttribute('fill', i < steps ? PIP_ON : PIP_OFF))
      if (more) pop(view.pipDots[steps - 1], [{ opacity: 0.2 }, { opacity: 1 }], 260)
    }

    const lookChanged = kind !== view.kind || stage !== view.stage || wilted !== view.wilted
    const crateChanged = isCrate && value !== view.value
    if (lookChanged || crateChanged) {
      const grew = animate && kind !== null && (kind !== view.kind || stage > view.stage)
      const potShown = !isCrate
      view.pot.setAttribute('visibility', potShown ? 'visible' : 'hidden')
      view.soil.setAttribute('visibility', potShown ? 'visible' : 'hidden')
      view.wet.setAttribute('visibility', potShown && moist >= 1 ? 'visible' : 'hidden')
      view.pips.setAttribute('visibility', potShown && moist >= 1 ? 'visible' : 'hidden')
      view.shadow.setAttribute('opacity', potShown ? '0.55' : '0')
      show(view.crate, isCrate)
      if (isCrate) view.crate.setAttribute('href', crateSprite(clamp(value, 0, 9)))
      if (crop) {
        const dim = stage === 0 ? [SEED_DIM.w, SEED_DIM.h] : PLANT_DIM[crop][stage - 1]
        const k = stage === 0 ? L.plant * 2.2 : L.plant
        const pw = dim[0] * k
        const ph = dim[1] * k
        const soilY = -potH + 6.3 * pot
        view.plant.setAttribute('href', stage === 0 ? SEED_SPRITE : PLANT_SPRITES[crop][stage - 1])
        view.plant.setAttribute('x', String(r2(-pw / 2)))
        view.plant.setAttribute('y', String(r2(soilY + pot * 1.2 - ph)))
        view.plant.setAttribute('width', String(r2(pw)))
        view.plant.setAttribute('height', String(r2(ph)))
        view.plant.setAttribute('class', wilted ? 'gh-wilted' : '')
      }
      show(view.plant, crop !== null)
      if (grew) pop(view.plantWrap, [{ transform: 'scale(0.8)' }, { transform: 'scale(1)' }], 200)
    }

    // 숫자 표시: 상자의 무게, 다 자란 해바라기의 꽃잎 수
    const showBadge = isCrate || (crop === 'Sunflower' && stage === 3)
    const wasBadge = view.kind === 'Crate' || (view.kind === 'Sunflower' && view.stage === 3)
    if (showBadge !== wasBadge || lookChanged || (showBadge && (value !== view.value || sorted !== view.sorted))) {
      view.badge.setAttribute('visibility', showBadge ? 'visible' : 'hidden')
      if (showBadge) {
        const crateH = (c * 0.8 * CRATE_DIM.h) / CRATE_DIM.w
        const bx = isCrate ? c * 0.33 : c * 0.32
        const by = isCrate ? -crateH - c * 0.02 : -potH - c * 0.24
        view.badge.setAttribute('transform', `translate(${r2(bx)} ${r2(by)})`)
        view.badgeCircle.setAttribute('fill', isCrate && !sorted ? ORANGE : '#ffffff')
        view.badgeText.textContent = String(value)
      }
    }
    if (sorted !== view.sorted || lookChanged) {
      view.line.setAttribute('visibility', isCrate && !sorted ? 'visible' : 'hidden')
    }

    view.kind = kind
    view.stage = stage
    view.wilted = wilted
    view.value = value
    view.sorted = sorted
  }

  // ── 드론 ───────────────────────────────────────────────────
  const trail = [0.5, 0.32, 0.18].map(opacity =>
    el('ellipse', { fill: TEAL, opacity, visibility: 'hidden' }, droneLayer))
  const droneG = el('g', { class: 'drone' }, droneLayer)
  const droneGlow = el('ellipse', { fill: TEAL, opacity: 0.55, visibility: 'hidden', class: 'gh-glow' }, droneG)
  const droneIdle = el('image', { href: DRONE_SPRITES.idle }, droneG)
  const droneLoaded = el('image', { href: DRONE_SPRITES.loaded, visibility: 'hidden' }, droneG)
  const rotors = ROTORS.map(() => el('ellipse', { fill: '#d9fbf6', opacity: 0.6 }, droneG))

  const drone = {
    x: 0, y: 0, // 화면에 그린 위치(흔들림 제외)
    cellX: -1, cellY: -1, // 지금 향하고 있는 칸
    fromX: 0, fromY: 0, toX: 0, toY: 0,
    outX: 0, outY: 0, inX: 0, inY: 0, // 끝을 넘어갈 때 사라지는 지점과 나타나는 지점
    wrap: false,
    ms: 0, dur: 0, // dur이 0이면 이동 중이 아니다.
    opacity: 1,
    tilt: 0,
    shakeMs: 0,
    loadedMs: 0,
    loadedShown: false,
    glowShown: false,
    trailShown: false,
    clock: 0,
  }
  const history: { x: number; y: number }[] = []

  function sizeDrone(): void {
    const { droneW: w, droneH: h } = L
    const loadedH = (w * DRONE_DIM.loadedH) / DRONE_DIM.w
    for (const [img, ih] of [[droneIdle, h], [droneLoaded, loadedH]] as const) {
      img.setAttribute('x', String(r2(-w / 2)))
      img.setAttribute('y', String(r2(h / 2 - ih)))
      img.setAttribute('width', String(r2(w)))
      img.setAttribute('height', String(r2(ih)))
    }
    ROTORS.forEach(([fx, fy, fr], i) => {
      rotors[i].setAttribute('cx', String(r2((fx - 0.5) * w)))
      rotors[i].setAttribute('cy', String(r2((fy - 0.5) * h)))
      rotors[i].setAttribute('rx', String(r2(fr * w)))
      rotors[i].setAttribute('ry', String(r2(fr * w * 0.3)))
    })
    droneGlow.setAttribute('cy', String(r2(h * 0.42)))
    droneGlow.setAttribute('rx', String(r2(w * 0.3)))
    droneGlow.setAttribute('ry', String(r2(h * 0.09)))
    trail.forEach((t, i) => {
      t.setAttribute('rx', String(r2(w * (0.3 - 0.06 * i))))
      t.setAttribute('ry', String(r2(h * (0.26 - 0.05 * i))))
    })
  }

  function snapDrone(cx: number, cy: number): void {
    drone.cellX = cx
    drone.cellY = cy
    drone.x = cellX(cx)
    drone.y = droneY(cy)
    drone.dur = 0
    drone.opacity = 1
    history.length = 0
  }

  // 끝을 넘어간 이동의 진행 방향. 이벤트에 방향이 없으므로 좌표로 추정한다.
  function wrapDirection(e: { fromX: number; fromY: number; x: number; y: number }): [number, number] {
    if (e.x !== e.fromX) return [e.x < e.fromX ? 1 : -1, 0]
    if (e.y !== e.fromY) return [0, e.y < e.fromY ? 1 : -1]
    // 한 칸짜리 축에서 제자리로 돌아온 경우: 위아래인지 좌우인지만 알 수 있다.
    return L.h === 1 && L.w !== 1 ? [0, 1] : [1, 0]
  }

  function startMove(e: Extract<WorldEvent, { type: 'move' }>, durMs: number, reduce: boolean): void {
    if (!inGrid(e.x, e.y)) return
    drone.cellX = e.x
    drone.cellY = e.y
    drone.toX = cellX(e.x)
    drone.toY = droneY(e.y)
    if (reduce && e.wrapped) { // 넘어가는 연출 없이 바로 옮긴다.
      drone.x = drone.toX
      drone.y = drone.toY
      drone.dur = 0
      drone.opacity = 1
      return
    }
    drone.fromX = drone.x
    drone.fromY = drone.y
    drone.wrap = e.wrapped
    if (e.wrapped) {
      const [dx, dy] = wrapDirection(e)
      const half = L.c / 2
      // 직전 이동이 덜 끝났더라도 출발 칸에서 반 칸 나간 지점으로 향한다.
      const sx = inGrid(e.fromX, e.fromY) ? cellX(e.fromX) : drone.x
      const sy = inGrid(e.fromX, e.fromY) ? droneY(e.fromY) : drone.y
      drone.outX = sx + dx * half
      drone.outY = sy - dy * half
      drone.inX = drone.toX - dx * half
      drone.inY = drone.toY + dy * half
    }
    drone.ms = 0
    drone.dur = Math.max(1, durMs)
  }

  function updateDrone(cx: number, cy: number, dt: number, reduce: boolean, powered: boolean): void {
    const prevX = drone.x
    if (drone.dur > 0) {
      drone.ms += dt
      const p = clamp(drone.ms / drone.dur, 0, 1)
      if (drone.wrap) {
        if (p < 0.5) {
          const q = p * 2
          drone.x = lerp(drone.fromX, drone.outX, q)
          drone.y = lerp(drone.fromY, drone.outY, q)
          drone.opacity = 1 - q
        } else {
          const q = (p - 0.5) * 2
          drone.x = lerp(drone.inX, drone.toX, q)
          drone.y = lerp(drone.inY, drone.toY, q)
          drone.opacity = q
        }
      } else {
        drone.x = lerp(drone.fromX, drone.toX, p)
        drone.y = lerp(drone.fromY, drone.toY, p)
        drone.opacity = 1
      }
      if (p >= 1) drone.dur = 0
    }
    // 이벤트 없이 위치가 바뀌었거나(불러오기 등) 이동이 끝났으면 실제 칸에 맞춘다.
    if (drone.dur === 0 || drone.cellX !== cx || drone.cellY !== cy) {
      drone.cellX = cx
      drone.cellY = cy
      drone.x = cellX(cx)
      drone.y = droneY(cy)
      drone.dur = 0
      drone.opacity = 1
    }

    drone.clock += dt
    let ox = 0
    let oy = 0
    let tilt = 0
    if (!reduce) {
      oy = Math.sin(drone.clock * 0.004) * 3
      if (drone.shakeMs > 0) {
        drone.shakeMs = Math.max(0, drone.shakeMs - dt)
        ox = Math.sin(drone.shakeMs * 0.07) * 4 * (drone.shakeMs / 250)
      }
      const vx = dt > 0 && drone.dur > 0 && !drone.wrap ? (drone.x - prevX) / dt : 0
      const target = clamp(vx * 22, -7, 7)
      drone.tilt += (target - drone.tilt) * Math.min(1, dt / 90)
      if (Math.abs(drone.tilt) < 0.05) drone.tilt = 0
      tilt = drone.tilt
      const phase = drone.clock * 0.05
      for (let i = 0; i < rotors.length; i++) {
        const base = ROTORS[i][2] * L.droneW
        rotors[i].setAttribute('rx', String(r2(base * (0.3 + 0.7 * Math.abs(Math.sin(phase + i * 1.3))))))
      }
    } else {
      drone.shakeMs = 0
      drone.tilt = 0
    }
    droneG.setAttribute('transform', `translate(${r2(drone.x + ox)} ${r2(drone.y + oy)})${tilt ? ` rotate(${r2(tilt)})` : ''}`)
    droneG.setAttribute('opacity', String(r2(drone.opacity)))

    if (drone.loadedMs > 0) drone.loadedMs = Math.max(0, drone.loadedMs - dt)
    const loaded = drone.loadedMs > 0
    if (loaded !== drone.loadedShown) {
      drone.loadedShown = loaded
      droneLoaded.setAttribute('visibility', loaded ? 'visible' : 'hidden')
      droneIdle.setAttribute('visibility', loaded ? 'hidden' : 'visible')
    }
    if (powered !== drone.glowShown) {
      drone.glowShown = powered
      droneGlow.setAttribute('visibility', powered ? 'visible' : 'hidden')
    }

    // 전력을 쓰는 동안 뒤에 남는 잔상
    const showTrail = powered && !reduce && !(drone.wrap && drone.dur > 0) // 반대편으로 넘어가는 동안에는 잔상을 끊는다.
    if (showTrail) {
      history.push({ x: drone.x, y: drone.y + oy })
      if (history.length > 10) history.shift()
      for (let i = 0; i < trail.length; i++) {
        const past = history[history.length - 1 - (i + 1) * 3]
        const far = past !== undefined && Math.hypot(past.x - drone.x, past.y - drone.y) > 2 && drone.opacity > 0.6
        trail[i].setAttribute('visibility', far ? 'visible' : 'hidden')
        if (far) {
          trail[i].setAttribute('cx', String(r2(past.x)))
          trail[i].setAttribute('cy', String(r2(past.y)))
        }
      }
      drone.trailShown = true
    } else if (drone.trailShown) {
      drone.trailShown = false
      history.length = 0
      for (const t of trail) t.setAttribute('visibility', 'hidden')
    }
  }

  // ── 바닥(출하장): 트럭, 화물칸, 물탱크 ─────────────────────
  // 세 가지가 같은 윗변과 밑변을 쓰고, 선반 아래 가운데에 같은 간격으로 놓인다.
  const pad = el('rect', { rx: 8, fill: '#0a1826', stroke: '#1d3c55', 'stroke-width': 1.5, opacity: 0.7 }, floorLayer)
  const truck = el('image', { href: TRUCK_SPRITES.open, class: 'gh-truck' }, floorLayer)
  const truckBox = { x: 0, y: 0, w: ROW.h * TRUCK_RATIO, h: ROW.h }
  let truckMs = 0
  let truckSquashed = false

  const slots = new Map<ItemKind, Slot>()
  for (const kind of CARGO_ORDER) slots.set(kind, buildSlot(kind))
  let cargoKey = ''
  let powerBlink = false
  let plantsFor: unknown = null
  let plantsSize = -1
  let plants = new Set<PlantKind>(['Daisy'])

  // 틀 한 칸. 원점은 윗변의 가운데이고, 너비는 자리를 잡을 때 정한다.
  function buildPlates(g: SVGGElement): SVGRectElement[] {
    return [
      el('rect', { y: 0, height: ROW.h, rx: 7, fill: FRAME.edge, class: 'gh-tile' }, g),
      el('rect', { y: 2, height: ROW.h - 4, rx: 5, fill: FRAME.rim }, g),
      el('rect', { y: 4, height: ROW.h - 8, rx: 3, fill: FRAME.fill }, g),
    ]
  }

  function sizePlates(plates: SVGRectElement[], width: number): void {
    plates.forEach((plate, i) => {
      plate.setAttribute('x', String(r2(-width / 2 + i * 2)))
      plate.setAttribute('width', String(r2(width - i * 4)))
    })
  }

  function buildSlot(kind: ItemKind): Slot {
    const g = el('g', { visibility: 'hidden' }, floorLayer)
    el('title', {}, g).textContent = ITEM_LABEL[kind]
    const plates = buildPlates(g)
    plates.push(el('rect', { y: 8, height: 42, rx: 3, fill: FRAME.inset }, g))
    const iconBox = el('g', { transform: `translate(0 ${SLOT.icon})` }, g)
    if (kind === 'Power') {
      iconBox.setAttribute('class', 'gh-power')
      el('circle', { r: 17, fill: '#0f4b4f', stroke: TEAL, 'stroke-width': 1.5 }, iconBox)
      el('path', { d: 'M3 -13 L-8 2 L-1 2 L-4 13 L8 -3 L1 -3 Z', fill: '#ffd447' }, iconBox)
    } else if (kind === 'Coin') {
      el('circle', { r: 15, fill: '#f6b61e' }, iconBox)
      el('circle', { r: 11, fill: '#ffd447', stroke: '#e09a06', 'stroke-width': 1.5 }, iconBox)
      el('rect', { x: -2, y: -6, width: 4, height: 12, rx: 1.5, fill: '#e09a06' }, iconBox)
    } else if (kind === 'Crate') {
      el('image', { href: CRATE_SPRITES[3], x: -24, y: -14, width: 48, height: 28.2 }, iconBox)
    } else if (kind !== 'Water') {
      const [w, h] = PLANT_DIM[kind][2]
      const k = Math.min(44 / w, 38 / h)
      el('image', { href: PLANT_SPRITES[kind][2], x: r2((-w * k) / 2), y: r2((-h * k) / 2), width: r2(w * k), height: r2(h * k) }, iconBox)
    }
    const text = el('text', { x: 0, y: SLOT.count, 'text-anchor': 'middle', 'font-size': 22, fill: '#ffffff', class: 'gh-count gh-num' }, g)
    const income = el('text', { x: 0, 'text-anchor': 'middle', fill: '#7ff0e6', class: 'gh-num', display: 'none' }, g)
    el('text', { x: 0, y: SLOT.label, 'text-anchor': 'middle', 'font-size': 12.5, fill: '#a9bccb', class: 'gh-label' }, g).textContent = ITEM_LABEL[kind]
    return { g, plates, text, income, incomeKey: '', shown: -1, index: -1, cx: 0, top: 0, width: ROW.tile, popX: ROW.tile * 0.24, pops: 0, shortAt: -SHORT_REPEAT_MS }
  }

  // 출하장 한 줄의 자리를 잡는다. 칸이 많아 넘치면 간격과 칸 너비를 줄인다.
  function layoutRow(kinds: ItemKind[], tankOn: boolean): void {
    const n = kinds.length
    const fixed = truckBox.w + (tankOn ? ROW.tank : 0)
    const gaps = n + (tankOn ? 1 : 0)
    const room = view.w - ROW.margin * 2
    let gap = ROW.gap
    let tile = ROW.tile
    if (fixed + n * tile + gaps * gap > room) {
      gap = ROW.minGap
      tile = clamp((room - fixed - gaps * gap) / Math.max(1, n), ROW.minTile, ROW.tile)
    }
    const total = fixed + n * tile + gaps * gap
    const top = L.floorY + ROW.top
    let x = view.w / 2 - total / 2
    pad.setAttribute('x', String(r2(x - 8)))
    pad.setAttribute('y', String(r2(top - 6)))
    pad.setAttribute('width', String(r2(total + 16)))
    pad.setAttribute('height', String(ROW.h + 12))
    truckBox.x = x
    truckBox.y = top
    truck.setAttribute('x', String(r2(x)))
    truck.setAttribute('y', String(r2(top)))
    truck.setAttribute('width', String(r2(truckBox.w)))
    truck.setAttribute('height', String(truckBox.h))
    truck.removeAttribute('transform')
    x += truckBox.w + gap
    for (const kind of CARGO_ORDER) {
      const slot = slots.get(kind)!
      const visible = kinds.includes(kind)
      slot.index = visible ? kinds.indexOf(kind) : -1
      slot.g.setAttribute('visibility', visible ? 'visible' : 'hidden')
      if (!visible) continue
      sizePlates(slot.plates.slice(0, 3), tile)
      slot.plates[3].setAttribute('x', String(r2(-tile / 2 + 8)))
      slot.plates[3].setAttribute('width', String(r2(tile - 16)))
      slot.g.setAttribute('transform', `translate(${r2(x + tile / 2)} ${r2(top)})`)
      slot.cx = x + tile / 2
      slot.top = top
      slot.width = tile
      slot.popX = tile * 0.24
      x += tile + gap
    }
    tank.setAttribute('visibility', tankOn ? 'visible' : 'hidden')
    if (tankOn) tank.setAttribute('transform', `translate(${r2(x + ROW.tank / 2)} ${r2(top)})`)
    tankTile.cx = x + ROW.tank / 2
    tankTile.top = top
  }

  function sourceUnlocked(kind: ItemKind): boolean {
    if (kind === 'Daisy') return true
    if (kind === 'Power') return plants.has('Sunflower')
    if (kind === 'Coin') return plants.has('Crate')
    if (kind === 'Crate' || kind === 'Water') return false
    return plants.has(kind)
  }

  // 출하장에 보일 화물칸과 물탱크
  function cargoShown(game: Game, s: WorldState, only: readonly ItemKind[] | undefined): { kinds: ItemKind[]; tankOn: boolean } {
    const tankOn = finite(s.waterCap, 0) >= 1
    if (only) return { kinds: CARGO_ORDER.filter(kind => only.includes(kind)), tankOn }
    if (plantsFor !== game.unlocked || plantsSize !== game.unlocked.size) {
      plantsFor = game.unlocked
      plantsSize = game.unlocked.size
      plants = unlockedPlants(game.unlocked)
    }
    return {
      kinds: CARGO_ORDER.filter(kind => sourceUnlocked(kind) || finite(s.items[kind], 0) > 0),
      tankOn,
    }
  }

  function updateCargo(s: WorldState, kinds: ItemKind[], tankOn: boolean, reduce: boolean): void {
    const key = `${kinds.join(',')}|${tankOn}`
    if (key !== cargoKey) {
      cargoKey = key
      layoutRow(kinds, tankOn)
    }
    for (const kind of CARGO_ORDER) {
      const slot = slots.get(kind)!
      if (slot.index < 0) continue
      const n = Math.max(0, Math.floor(finite(s.items[kind], 0)))
      if (n === slot.shown) continue
      const grew = slot.shown >= 0 && n > slot.shown
      slot.shown = n
      slot.text.textContent = formatCount(n)
      if (grew && !reduce) pop(slot.text, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], 200)
    }
    const powerSlot = slots.get('Power')!
    const blink = finite(s.items.Power, 0) > 0
    if (blink !== powerBlink) {
      powerBlink = blink
      powerSlot.g.classList.toggle('gh-powered', blink)
    }
  }

  // 분당 수확량: 수 아래에 '분당 +12'처럼 적는다. 0이면 적지 않는다. 칸보다 길면 글자 폭을 좁혀 칸 안에 넣는다.
  function updateIncome(income: Partial<Record<ItemKind, number>> | undefined): void {
    const scale = pane.w > 0 && pane.h > 0 ? Math.min(pane.w / view.w, pane.h / view.h) : 1
    const size = Math.ceil(clamp(INCOME_PX / scale, INCOME_PX, INCOME_MAX) * 2) / 2
    for (const kind of CARGO_ORDER) {
      const slot = slots.get(kind)!
      if (slot.index < 0) continue
      const n = Math.max(0, Math.round(finite(income?.[kind] ?? 0, 0)))
      const key = `${n}|${size}|${r2(slot.width)}`
      if (key === slot.incomeKey) continue
      slot.incomeKey = key
      show(slot.income, n > 0)
      if (n === 0) continue
      slot.income.textContent = `분당 +${formatCount(n)}`
      slot.income.setAttribute('font-size', String(size))
      slot.income.setAttribute('y', String(r2(SLOT.count + 4 + size * 0.9)))
      slot.income.removeAttribute('textLength')
      const room = slot.width - 8
      if (typeof slot.income.getComputedTextLength === 'function' && slot.income.getComputedTextLength() > room) {
        slot.income.setAttribute('textLength', String(r2(room)))
        slot.income.setAttribute('lengthAdjust', 'spacingAndGlyphs')
      }
    }
  }

  // 물탱크도 화물칸과 같은 틀을 쓴다. 왼쪽에 수위, 오른쪽에 남은 양을 보여 준다.
  const tank = el('g', { visibility: 'hidden' }, floorLayer)
  el('title', {}, tank).textContent = ITEM_LABEL.Water
  sizePlates(buildPlates(tank), ROW.tank)
  const gauge = el('g', { transform: `translate(${-ROW.tank / 2 + TANK.x} 0)` }, tank)
  el('rect', { x: 0, y: TANK.y, width: TANK.w, height: TANK.h, rx: 6, fill: FRAME.inset }, gauge)
  const tankWater = el('rect', { x: 0, y: TANK.y + TANK.h, width: TANK.w, height: 0, fill: '#3fa9f5', 'clip-path': 'url(#gh-tank)' }, gauge)
  const tankSurface = el('rect', { x: 0, y: TANK.y + TANK.h, width: TANK.w, height: 3, fill: '#a5dcff', 'clip-path': 'url(#gh-tank)' }, gauge)
  el('rect', { x: 0, y: TANK.y, width: TANK.w, height: TANK.h, rx: 6, fill: 'none', stroke: '#a9c9dc', 'stroke-width': 2 }, gauge)
  for (const f of [0.25, 0.5, 0.75]) {
    el('rect', { x: TANK.w - 10, y: r2(TANK.y + TANK.h * (1 - f)), width: 8, height: 1.5, fill: '#a9c9dc', opacity: 0.7 }, gauge)
  }
  el('rect', { x: 5, y: TANK.y + 6, width: 4, height: TANK.h * 0.5, rx: 2, fill: '#ffffff', opacity: 0.16 }, gauge)
  const tankOutline = el('rect', { x: 0, y: TANK.y, width: TANK.w, height: TANK.h, rx: 6, fill: 'none', stroke: WARN, 'stroke-width': 2, 'stroke-dasharray': '4 3', visibility: 'hidden' }, gauge)
  const tankMid = (TANK.x + TANK.w) / 2 + 2 // 수위 오른쪽 자리의 가운데(틀 가운데 기준)
  // 다음 물이 채워지기까지의 진행을 물방울 둘레의 고리로 보여 준다.
  const RING_Y = 33
  const RING_LEN = 2 * Math.PI * RING_R
  el('circle', { cx: tankMid, cy: RING_Y, r: RING_R, fill: FRAME.inset, stroke: '#24415a', 'stroke-width': 3.5 }, tank)
  const tankRing = el('circle', {
    cx: tankMid, cy: RING_Y, r: RING_R, fill: 'none', stroke: '#3fa9f5', 'stroke-width': 3.5,
    'stroke-dasharray': `0 ${r2(RING_LEN)}`, transform: `rotate(-90 ${tankMid} ${RING_Y})`, class: 'gh-refill',
  }, tank)
  const tankDrop = el('image', { href: DROP_SPRITE, x: tankMid - 6.5, y: RING_Y - 9.6, width: 13, height: 19.2 }, tank)
  const tankText = el('text', { x: tankMid, y: 80, 'text-anchor': 'middle', 'font-size': 19, fill: '#ffffff', class: 'gh-count gh-num' }, tank)
  // 맨 아랫줄: 이름과, 언제 채워지는지 또는 가득 찼는지
  const tankNote = el('text', { x: 0, y: SLOT.label, 'text-anchor': 'middle', 'font-size': 12.5, fill: '#a9bccb', class: 'gh-label' }, tank)
  el('tspan', {}, tankNote).textContent = `${ITEM_LABEL.Water} · `
  const tankState = el('tspan', { class: 'gh-tank-state' }, tankNote)
  const tankTile: Tile = { text: tankText, cx: 0, top: 0, width: ROW.tank, popX: tankMid + 26, pops: 0, shortAt: -SHORT_REPEAT_MS }
  let tankKey = ''
  let tankWorld: unknown = null
  let tankShown = -1

  function updateTank(game: Game, s: WorldState, reduce: boolean): void {
    const cap = Math.max(0, Math.floor(finite(s.waterCap, 0)))
    const water = clamp(Math.floor(finite(s.items.Water, 0)), 0, Math.max(cap, 0))
    const full = cap > 0 && water >= cap
    // 가득 차면 더 채워지지 않으므로 고리는 꽉 찬 채로 멈춘다.
    const step = full ? REFILL_STEPS : clamp(Math.floor((finite(s.waterTimerMs, 0) / WATER_FILL_MS) * REFILL_STEPS), 0, REFILL_STEPS - 1)
    const key = `${cap}/${water}/${step}`
    if (key === tankKey) return
    tankKey = key
    if (cap <= 0) { tankShown = -1; return }
    // 같은 온실에서 물이 늘었으면 방금 채워진 것이다(불러오기나 다시 시작으로 바뀐 수에는 표시하지 않는다).
    if (tankWorld === game.world && tankShown >= 0 && water > tankShown && budget > 0) {
      floatGain(`+${formatCount(water - tankShown)}`, tankTile.cx + tankMid, tankTile.top + 26, reduce)
      if (!reduce) pop(tankText, [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], 200)
    }
    tankWorld = game.world
    if (water !== tankShown) {
      tankShown = water
      const height = TANK.h * clamp(water / cap, 0, 1)
      tankWater.setAttribute('y', String(r2(TANK.y + TANK.h - height)))
      tankWater.setAttribute('height', String(r2(height)))
      tankSurface.setAttribute('y', String(r2(TANK.y + TANK.h - height)))
      tankSurface.setAttribute('visibility', water > 0 ? 'visible' : 'hidden')
      tankText.textContent = `${water} / ${cap}`
      // 비어 있으면 숫자와 수위 틀을 경고색으로, 물방울을 흐리게 그린다.
      const empty = water === 0
      tankText.setAttribute('fill', empty ? WARN : '#ffffff')
      tankOutline.setAttribute('visibility', empty ? 'visible' : 'hidden')
      tankDrop.setAttribute('opacity', empty ? '0.35' : '1')
      tankState.textContent = full ? '가득 참' : refillCaption()
      tankState.setAttribute('fill', full ? '#7ff0e6' : '#a9bccb')
      tankRing.setAttribute('stroke', full ? '#7ff0e6' : '#3fa9f5')
      tank.setAttribute('class', full ? 'gh-tank is-full' : empty ? 'gh-tank is-empty' : 'gh-tank')
    }
    tankRing.setAttribute('stroke-dasharray', `${r2((RING_LEN * step) / REFILL_STEPS)} ${r2(RING_LEN)}`)
  }

  function updateTruck(dt: number): void {
    if (truckMs <= 0) {
      if (truckSquashed) {
        truckSquashed = false
        truck.removeAttribute('transform')
      }
      return
    }
    truckMs = Math.max(0, truckMs - dt)
    const k = Math.sin(Math.PI * (1 - truckMs / 150)) * 0.05
    const bottom = r2(truckBox.y + truckBox.h - 6)
    const mid = r2(truckBox.x + truckBox.w / 2)
    truck.setAttribute('transform', `translate(${mid} ${bottom}) scale(${r2(1 + k * 0.5)} ${r2(1 - k)}) translate(${-mid} ${-bottom})`)
    truckSquashed = true
  }

  // ── 효과 ───────────────────────────────────────────────────
  let effects: Effect[] = []
  let budget = 0
  let textSide = 1
  let failMarkAlive = false

  function addEffect(node: SVGElement, life: number, step: (p: number) => void, delay = 0, done?: () => void): void {
    if (budget <= 0) return
    budget--
    while (effects.length >= MAX_EFFECTS) {
      const old = effects.shift()!
      old.node.remove()
      old.done?.()
    }
    if (delay > 0) node.setAttribute('visibility', 'hidden')
    fxLayer.appendChild(node)
    effects.push({ node, age: 0, delay, life, step, done })
    if (delay <= 0) step(0)
  }

  function stepEffects(dt: number): void {
    if (effects.length === 0) return
    const alive: Effect[] = []
    for (const fx of effects) {
      fx.age += dt
      if (fx.age < fx.delay) { alive.push(fx); continue }
      const p = (fx.age - fx.delay) / fx.life
      if (p >= 1) {
        fx.node.remove()
        fx.done?.()
        continue
      }
      if (fx.delay > 0) {
        fx.delay = 0
        fx.age = p * fx.life
        fx.node.removeAttribute('visibility')
      }
      fx.step(p)
      alive.push(fx)
    }
    effects = alive
  }

  function clearEffects(): void {
    for (const fx of effects) fx.node.remove()
    effects = []
    failMarkAlive = false
    shortLabelAt.clear()
    for (const slot of slots.values()) slot.pops = 0
    tankTile.pops = 0
  }

  function flyToTruck(href: string, fromX: number, fromY: number, size: number, ratio: number, delay: number): void {
    const node = el('image', { href, x: r2(-size / 2), y: r2((-size * ratio) / 2), width: r2(size), height: r2(size * ratio) })
    const doorX = truckBox.x + truckBox.w * 0.3
    const doorY = truckBox.y + truckBox.h * 0.6
    const lift = 40 + Math.abs(fromX - doorX) * 0.12
    addEffect(node, 500, p => {
      const e = p * p * (3 - 2 * p)
      const x = lerp(fromX, doorX, e)
      const y = lerp(fromY, doorY, e) - Math.sin(Math.PI * p) * lift
      node.setAttribute('transform', `translate(${r2(x)} ${r2(y)}) scale(${r2(1 - 0.45 * p)})`)
      node.setAttribute('opacity', p > 0.85 ? String(r2((1 - p) / 0.15)) : '1')
    }, delay, () => { truckMs = 150 })
  }

  function harvestSprite(item: ItemKind, view: CellView | undefined): { href: string; ratio: number } {
    if (item === 'Coin' || item === 'Crate') {
      const weight = view && view.kind === 'Crate' ? clamp(view.value, 0, 9) : 4
      return { href: crateSprite(weight), ratio: CRATE_DIM.h / CRATE_DIM.w }
    }
    const crop: Crop = item === 'Power' ? 'Sunflower' : item === 'Water' ? 'Daisy' : item
    const [w, h] = PLANT_DIM[crop][2]
    return { href: PLANT_SPRITES[crop][2], ratio: h / w }
  }

  function floatText(label: string, x: number, y: number): void {
    textSide = -textSide
    const size = clamp(L.c * 0.36, 30, 42)
    const tx = clamp(x + textSide * 10, 50, view.w - 50)
    const ty = Math.max(size + 34 + CEILING_Y, y) // 떠오른 뒤에도 화면 위로 잘리지 않게 한다.
    const node = el('text', {
      x: r2(tx), 'text-anchor': 'middle', 'font-size': r2(size), fill: '#ffffff',
      stroke: '#06323a', 'stroke-width': 5, 'paint-order': 'stroke', 'stroke-linejoin': 'round', class: 'gh-count gh-num',
    })
    node.textContent = label
    addEffect(node, 1100, p => {
      node.setAttribute('y', String(r2(ty - 34 * (1 - (1 - p) * (1 - p)))))
      node.setAttribute('opacity', p > 0.65 ? String(r2((1 - p) / 0.35)) : '1')
    })
  }

  // ── 심는 값 ────────────────────────────────────────────────
  // 수확의 반대 방향: 화물칸의 자원이 화분으로 날아가고, 화물칸에는 줄어든 수가 뜬다.
  let sceneMs = 0 // 장면이 그려진 시간. 부족 표시의 간격을 잴 때 쓴다.
  let shortLabelLast = -SHORT_LABEL_GAP_MS
  const shortLabelAt = new Map<number, number>() // 칸 번호 → 마지막으로 부족 문구를 띄운 시각

  function flyToPot(href: string, slot: Slot, toX: number, toY: number, size: number, ratio: number, delay: number): void {
    const node = el('image', {
      href, x: r2(-size / 2), y: r2((-size * ratio) / 2), width: r2(size), height: r2(size * ratio), class: 'gh-cost-fly',
    })
    const fromX = slot.cx
    const fromY = slot.top + SLOT.icon
    const lift = 30 + Math.abs(fromX - toX) * 0.1
    addEffect(node, 560, p => {
      const e = p * p * (3 - 2 * p)
      const x = lerp(fromX, toX, e)
      const y = lerp(fromY, toY, e) - Math.sin(Math.PI * p) * lift
      node.setAttribute('transform', `translate(${r2(x)} ${r2(y)}) scale(${r2(1 - 0.4 * p)})`)
      node.setAttribute('opacity', p > 0.8 ? String(r2((1 - p) / 0.2)) : '1')
    }, delay)
  }

  // 화물칸 위로 떠오르는 '−N'. 수확의 흰 '+N'과 헷갈리지 않도록 경고색으로 작게 쓴다.
  function costPop(slot: Tile, amount: number, reduce: boolean): void {
    if (slot.pops >= MAX_POPS_PER_TILE) return
    const x = slot.cx + slot.popX
    const y = slot.top + 26
    const node = el('text', {
      x: r2(x), 'text-anchor': 'middle', 'font-size': 23, fill: WARN,
      stroke: '#2a1700', 'stroke-width': 4.5, 'paint-order': 'stroke', 'stroke-linejoin': 'round', class: 'gh-num gh-cost-pop',
    })
    node.textContent = `−${formatCount(amount)}`
    slot.pops++
    addEffect(node, 850, p => {
      node.setAttribute('y', String(r2(reduce ? y : y - 24 * (1 - (1 - p) * (1 - p)))))
      node.setAttribute('opacity', p > 0.6 ? String(r2((1 - p) / 0.4)) : '1')
    }, 0, () => { slot.pops = Math.max(0, slot.pops - 1) })
    if (node.parentNode === null) slot.pops-- // 한 프레임의 효과 한도를 넘어 추가되지 않았다.
  }

  // 바닥의 칸에 자원이 들어왔을 때 뜨는 '+N'. 수확의 '+N'과 같은 흰 글자를 작게 쓴다.
  function floatGain(label: string, x: number, y: number, reduce: boolean): void {
    const node = el('text', {
      x: r2(x), 'text-anchor': 'middle', 'font-size': 24, fill: '#ffffff',
      stroke: '#06323a', 'stroke-width': 4.5, 'paint-order': 'stroke', 'stroke-linejoin': 'round', class: 'gh-num gh-gain-pop',
    })
    node.textContent = label
    addEffect(node, 950, p => {
      node.setAttribute('y', String(r2(reduce ? y : y - 22 * (1 - (1 - p) * (1 - p)))))
      node.setAttribute('opacity', p > 0.65 ? String(r2((1 - p) / 0.35)) : '1')
    })
  }

  function showCost(e: Extract<WorldEvent, { type: 'plant' }>, reduce: boolean): void {
    if (!Array.isArray(e.cost) || !inGrid(e.x, e.y)) return
    const toX = cellX(e.x)
    const toY = cellBase(e.y) - POT_DIM.h * L.pot - L.c * 0.04
    for (const c of e.cost) {
      const slot = c ? slots.get(c.item) : undefined
      const amount = c ? Math.floor(finite(c.amount, 0)) : 0
      if (!slot || slot.index < 0 || amount <= 0) continue
      if (!reduce) {
        const sprite = harvestSprite(c.item, undefined)
        const size = clamp(L.c * 0.3, 24, 40)
        for (let i = 0; i < Math.min(amount, MAX_FLY_PER_COST); i++) flyToPot(sprite.href, slot, toX, toY, size, sprite.ratio, i * 90)
        // 화물칸의 수가 잠깐 움츠러든다.
        pop(slot.text, [
          { transform: 'scale(1)', fill: WARN }, { transform: 'scale(0.72)', fill: WARN }, { transform: 'scale(1)', fill: '#ffffff' },
        ], 320)
      }
      costPop(slot, amount, reduce)
    }
  }

  // 값을 내지 못해 심지 못했을 때: 모자란 자원의 화물칸이 경고색으로 번쩍이고, 화분 위에 까닭을 적는다.
  // 반복하는 코드는 지나갈 때마다 실패할 수 있으므로, 같은 화분과 같은 화물칸에서는 간격을 두고 보여 준다.
  function showShortage(e: Extract<WorldEvent, { type: 'fail' }>, reduce: boolean): void {
    if (!Array.isArray(e.need) || !inGrid(e.x, e.y)) return
    const items: ItemKind[] = []
    for (const n of e.need) {
      if (!n || ITEM_LABEL[n.item] === undefined || items.includes(n.item)) continue
      items.push(n.item)
      const slot = slots.get(n.item)
      const tile: Tile | undefined = n.item === 'Water' ? (tankKey === '' || tankShown < 0 ? undefined : tankTile) : slot && slot.index >= 0 ? slot : undefined
      if (tile && sceneMs - tile.shortAt >= SHORT_REPEAT_MS) flashTile(tile, reduce)
    }
    const index = e.y * L.w + e.x
    const last = shortLabelAt.get(index)
    if (items.length === 0 || sceneMs - shortLabelLast < SHORT_LABEL_GAP_MS) return
    if (last !== undefined && sceneMs - last < SHORT_REPEAT_MS) return

    const label = shortageText(items)
    const size = clamp(L.c * 0.1, 13, 17)
    let em = 0
    for (const ch of label) em += ch === ' ' || ch === ',' ? 0.3 : 1
    const w = em * size + 18
    const hgt = size + 11
    const x = clamp(cellX(e.x), w / 2 + 6, view.w - w / 2 - 6)
    const y = cellBase(e.y) - POT_DIM.h * L.pot - L.c * 0.17
    const node = el('g', { class: 'gh-short-label' })
    el('rect', {
      x: r2(-w / 2), y: r2(-hgt / 2), width: r2(w), height: r2(hgt), rx: 5,
      fill: '#22160a', stroke: WARN, 'stroke-width': 1.5, opacity: 0.94,
    }, node)
    el('text', { 'text-anchor': 'middle', dy: '0.36em', 'font-size': r2(size), fill: '#ffe0b0' }, node).textContent = label
    addEffect(node, SHORT_LABEL_MS, p => {
      const rise = reduce ? 0 : 7 * Math.min(1, p / 0.12)
      node.setAttribute('transform', `translate(${r2(x)} ${r2(y - rise)})`)
      node.setAttribute('opacity', p > 0.78 ? String(r2((1 - p) / 0.22)) : '1')
    })
    if (node.parentNode === null) return // 한 프레임의 효과 한도를 넘어 추가되지 않았다.
    shortLabelLast = sceneMs
    shortLabelAt.set(index, sceneMs)
  }

  function flashTile(slot: Tile, reduce: boolean): void {
    const node = el('rect', {
      x: r2(slot.cx - slot.width / 2 + 1), y: r2(slot.top + 1), width: r2(slot.width - 2), height: ROW.h - 2, rx: 7,
      fill: WARN, 'fill-opacity': 0.2, stroke: WARN, 'stroke-width': 3, class: 'gh-short-tile',
    })
    addEffect(node, 900, p => {
      // 두 번 번쩍이고 사라진다. 움직임을 줄인 환경에서는 한 번 켜졌다가 흐려지기만 한다.
      const k = reduce ? 1 - p : (0.55 + 0.45 * Math.cos(p * Math.PI * 4)) * (1 - p * p)
      node.setAttribute('opacity', String(r2(k)))
      if (!reduce) node.setAttribute('transform', `translate(${r2(Math.sin(p * Math.PI * 6) * 3 * (1 - p))} 0)`)
    })
    if (node.parentNode === null) return
    slot.shortAt = sceneMs
    if (!reduce) pop(slot.text, [{ fill: WARN }, { fill: WARN, offset: 0.7 }, { fill: '#ffffff' }], 900)
  }

  function handleEvents(game: Game, events: WorldEvent[], reduce: boolean): void {
    const tps = finite(game.ticksPerSecond(), 400)
    const actionMs = tps > 0 ? (200 / tps) * 1000 : 500
    let lastMove: Extract<WorldEvent, { type: 'move' }> | null = null
    for (const e of events) {
      if (!e || typeof e !== 'object') continue
      switch (e.type) {
        case 'move':
          lastMove = e
          break
        case 'harvest': {
          audio?.play('harvest')
          drone.loadedMs = 400
          const list = Array.isArray(e.cells) ? e.cells : []
          if (!reduce) {
            const count = Math.min(list.length, MAX_FLY_PER_HARVEST)
            const size = clamp(L.c * 0.42, 26, 56)
            for (let i = 0; i < count; i++) {
              const p = list[i]
              if (!p || !inGrid(p.x, p.y)) continue
              const sprite = harvestSprite(e.item, cells[p.y * L.w + p.x])
              flyToTruck(sprite.href, cellX(p.x), cellBase(p.y) - L.c * 0.4, size, sprite.ratio, i * 14)
            }
          }
          if (finite(e.amount, 0) >= 2 && inGrid(e.x, e.y)) {
            floatText(`+${formatCount(e.amount)}`, cellX(e.x), droneY(e.y) - L.droneH / 2 - 10)
          }
          break
        }
        case 'plant':
          audio?.play('plant')
          showCost(e, reduce)
          break
        case 'water': {
          audio?.play('water')
          if (tankShown >= 0) costPop(tankTile, 1, reduce)
          if (reduce || !inGrid(e.x, e.y)) break
          const x = cellX(e.x)
          const top = droneY(e.y) + L.droneH * 0.3
          const bottom = cellBase(e.y) - POT_DIM.h * L.pot
          const w = clamp(L.c * 0.12, 9, 16)
          for (let i = 0; i < 3; i++) {
            const dx = (i - 1) * L.c * 0.09
            const node = el('image', { href: DROP_SPRITE, x: r2(x + dx - w / 2), width: r2(w), height: r2(w * 31 / 21) })
            addEffect(node, 360, p => {
              node.setAttribute('y', String(r2(lerp(top, bottom, p * p) - w)))
              node.setAttribute('opacity', p > 0.8 ? String(r2((1 - p) / 0.2)) : '1')
            }, i * 80)
          }
          break
        }
        case 'fail': {
          if (!reduce) drone.shakeMs = 250
          if (e.reason === 'cost' || e.reason === 'water') showShortage(e, reduce)
          if (failMarkAlive || !inGrid(e.x, e.y)) break
          const k = clamp(L.c * 0.06, 5, 8)
          const node = el('path', {
            d: `M${-k} ${-k} L${k} ${k} M${k} ${-k} L${-k} ${k}`, stroke: ORANGE, 'stroke-width': 3.5, 'stroke-linecap': 'round', fill: 'none',
            transform: `translate(${r2(cellX(e.x) + L.droneW * 0.48)} ${r2(droneY(e.y) - L.droneH * 0.42)})`,
          })
          failMarkAlive = true
          addEffect(node, 380, p => { node.setAttribute('opacity', String(r2(1 - p * p))) }, 0, () => { failMarkAlive = false })
          if (node.parentNode === null) failMarkAlive = false // 한 프레임의 효과 한도를 넘어 추가되지 않았다.
          break
        }
        case 'wilt': {
          if (reduce || !inGrid(e.x, e.y)) break
          const x = cellX(e.x)
          const y = cellBase(e.y) - L.c * 0.5
          for (let i = 0; i < 3; i++) {
            const dx = (i - 1) * L.c * 0.08
            const node = el('circle', { cx: r2(x + dx), fill: '#aeb6bd' })
            addEffect(node, 800, p => {
              node.setAttribute('cy', String(r2(y - p * L.c * 0.3)))
              node.setAttribute('r', String(r2(L.c * (0.04 + 0.06 * p))))
              node.setAttribute('opacity', String(r2(0.6 * (1 - p))))
            }, i * 110)
          }
          break
        }
        case 'swap': {
          const d = DELTA[e.dir]
          if (reduce || !d) break
          const nx = e.x + d[0]
          const ny = e.y + d[1]
          if (!inGrid(e.x, e.y) || !inGrid(nx, ny)) break
          const a = cells[e.y * L.w + e.x]
          const b = cells[ny * L.w + nx]
          if (!a || !b) break
          // 내용물은 이미 자리를 바꿨으므로, 서로가 있던 자리에서 출발해 제자리로 들어오게 한다.
          startSlide(a, d[0] * L.c, -d[1] * L.c)
          startSlide(b, -d[0] * L.c, d[1] * L.c)
          break
        }
      }
    }
    if (lastMove) startMove(lastMove, actionMs, reduce)
  }

  function startSlide(view: CellView, dx: number, dy: number): void {
    if (view.slideMs < 0) sliding.push(view)
    view.slideX = dx
    view.slideY = dy
    view.slideMs = 0
  }

  function stepSlides(dt: number): void {
    if (sliding.length === 0) return
    const still: CellView[] = []
    for (const view of sliding) {
      view.slideMs += dt
      const p = clamp(view.slideMs / 200, 0, 1)
      if (p >= 1) {
        view.slideMs = -1
        view.content.removeAttribute('transform')
        continue
      }
      const k = (1 - p) * (1 - p)
      view.content.setAttribute('transform', `translate(${r2(view.slideX * k)} ${r2(view.slideY * k)})`)
      still.push(view)
    }
    sliding = still
  }

  // ── 그리기 ─────────────────────────────────────────────────
  let labelKey = ''
  const reportedErrors = new Set<string>()
  const MAX_REPORTED_ERRORS = 20

  // 그리기 오류가 프레임 반복을 멈추지 않게 한다. 같은 오류로 콘솔이 넘치지 않도록 내용이 같은 오류는 한 번만 알린다.
  function report(err: unknown): void {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    if (reportedErrors.has(message) || reportedErrors.size >= MAX_REPORTED_ERRORS) return
    reportedErrors.add(message)
    console.error(err)
  }

  function draw(game: Game, events: WorldEvent[], dtMs: number, extra: GreenhouseExtra | undefined): void {
    const s = game.world.state
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? Math.min(dtMs, 250) : 0
    const w = clamp(Math.floor(finite(s.w, 1)), 1, MAX_SIDE)
    const h = clamp(Math.floor(finite(s.h, 1)), 1, MAX_SIDE)
    const reduce = motionQuery !== null && motionQuery.matches
    const list = Array.isArray(events) ? events : []

    const dx = clamp(Math.floor(finite(s.droneX, 0)), 0, w - 1)
    const dy = clamp(Math.floor(finite(s.droneY, 0)), 0, h - 1)

    const cargo = cargoShown(game, s, extra?.cargo)
    const next = chooseView(pane.w, pane.h, w, h, rowMinWidth(cargo.kinds.length, cargo.tankOn))
    if (!built || w !== L.w || h !== L.h || next.w !== view.w || next.h !== view.h) {
      if (next.w !== view.w || next.h !== view.h) {
        view.w = next.w
        view.h = next.h
        root.setAttribute('viewBox', `0 0 ${view.w} ${view.h}`)
      }
      buildShelf(w, h)
      sizeDrone()
      clearEffects()
      snapDrone(dx, dy)
    }

    sceneMs += dt
    budget = MAX_NEW_EFFECTS_PER_FRAME
    // 효과를 만들다가 오류가 나도 칸과 드론은 이번 프레임의 상태로 그려지게 한다.
    try {
      handleEvents(game, list, reduce)
    } catch (err) {
      report(err)
    }

    const animate = !fresh && !reduce
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) updateCell(cells[y * w + x], s, x, y, animate)
    }
    fresh = false
    stepSlides(dt)

    const key = `${w}x${h}:${dx},${dy}`
    if (key !== markKey) {
      markKey = key
      const base = cellBase(dy)
      markGlow.setAttribute('cx', String(r2(cellX(dx))))
      markGlow.setAttribute('cy', String(r2(base - L.c * 0.02)))
      markGlow.setAttribute('rx', String(r2(L.c * 0.45)))
      markGlow.setAttribute('ry', String(r2(L.c * 0.1)))
      markStrip.setAttribute('x', String(r2(cellX(dx) - L.c / 2 + 3)))
      markStrip.setAttribute('y', String(r2(base)))
      markStrip.setAttribute('width', String(r2(L.c - 6)))
      markStrip.setAttribute('height', String(L.board))
    }

    updateDrone(dx, dy, dt, reduce, finite(s.items.Power, 0) > 0)
    updateCargo(s, cargo.kinds, cargo.tankOn, reduce)
    updateIncome(extra?.income)
    updateTank(game, s, reduce)
    updateTruck(dt)
    stepEffects(dt)

    if (key !== labelKey) {
      labelKey = key
      root.setAttribute('aria-label',
        `온실 선반은 가로 ${w}칸, 세로 ${h}칸입니다. 드론은 왼쪽에서 ${dx + 1}번째, 아래에서 ${dy + 1}번째 칸에 있습니다.`)
    }
  }

  parent.replaceChildren(root)
  let destroyed = false

  return {
    render(game, events, dtMs, extra) {
      if (destroyed) return
      try {
        draw(game, events, dtMs, extra)
      } catch (err) {
        report(err)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      observer?.disconnect()
      clearEffects()
      root.remove()
    },
  }
}

// ── 선반이나 화면 크기가 바뀔 때 다시 그리는 것 ─────────────────
function buildDefs(defs: SVGDefsElement, L: Layout, viewH: number): void {
  const { floorY } = L
  const wall = el('linearGradient', { id: 'gh-wall', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 0, y2: floorY }, defs)
  el('stop', { offset: 0, 'stop-color': '#0f2439' }, wall)
  el('stop', { offset: 1, 'stop-color': '#183650' }, wall)
  const cone = el('linearGradient', { id: 'gh-cone', gradientUnits: 'userSpaceOnUse', x1: 0, y1: r2(L.lampY), x2: 0, y2: r2(L.gy + L.c * L.h) }, defs)
  el('stop', { offset: 0, 'stop-color': '#5ff0e0', 'stop-opacity': 0.3 }, cone)
  el('stop', { offset: 1, 'stop-color': '#5ff0e0', 'stop-opacity': 0.03 }, cone)
  const floor = el('linearGradient', { id: 'gh-floor', gradientUnits: 'userSpaceOnUse', x1: 0, y1: floorY, x2: 0, y2: viewH }, defs)
  el('stop', { offset: 0, 'stop-color': '#0d2032' }, floor)
  el('stop', { offset: 1, 'stop-color': '#08131f' }, floor)
  const tank = el('clipPath', { id: 'gh-tank' }, defs)
  el('rect', { x: 0, y: TANK.y, width: TANK.w, height: TANK.h, rx: 6 }, tank)
  const win = el('clipPath', { id: 'gh-win' }, defs)
  el('circle', { cx: 0, cy: 0, r: WINDOW_R - 12 }, win)
}

// 재배등, 뒤판, 작업대, 기둥, 선반 판. 칸의 내용물은 그리지 않는다.
function buildShelfFrame(shelfLayer: SVGGElement, L: Layout): void {
  const { w, h, c, gx, gy, board, floorY, lampY } = L
  const gw = c * w
  const gh = c * h
  const mid = gx + gw / 2
  const bottom = gy + gh

  // 재배등과 아래로 퍼지는 빛. 재배등은 선반 바로 위에 있고, 천장에서 줄 두 개로 매단다.
  const lampW = Math.max(90, gw * 0.55)
  el('polygon', {
    points: `${r2(mid - lampW / 2)},${r2(lampY + 16)} ${r2(mid + lampW / 2)},${r2(lampY + 16)} ${r2(gx + gw + 26)},${r2(bottom)} ${r2(gx - 26)},${r2(bottom)}`,
    fill: 'url(#gh-cone)',
  }, shelfLayer)
  for (const side of [-1, 1]) {
    el('rect', { x: r2(mid + side * lampW * 0.36 - 1), y: CEILING_Y, width: 2, height: r2(lampY - CEILING_Y), fill: '#5d7488' }, shelfLayer)
  }
  el('rect', { x: r2(mid - lampW / 2 - 8), y: r2(lampY), width: r2(lampW + 16), height: 11, rx: 4, fill: '#c9d6df' }, shelfLayer)
  el('rect', { x: r2(mid - lampW / 2), y: r2(lampY + 11), width: r2(lampW), height: 5, rx: 2, fill: '#7ff5e6' }, shelfLayer)

  // 선반 뒤판: 식물이 벽이나 창과 섞여 보이지 않게 한다.
  el('rect', { x: r2(gx - 8), y: r2(gy - 6), width: r2(gw + 16), height: r2(gh + 6), rx: 6, fill: '#081625', opacity: 0.55 }, shelfLayer)

  // 선반이 작으면 작업대 위에 올려 둔다.
  const benchH = floorY - bottom
  if (benchH >= 60) {
    const bx = gx - 8
    const bw = gw + 16
    const by = bottom + 2
    const bh = benchH - 10
    el('rect', { x: r2(bx), y: r2(by), width: r2(bw), height: r2(bh), rx: 4, fill: '#0d2135', stroke: '#2f5571', 'stroke-width': 1.5 }, shelfLayer)
    // 칸마다 서랍 하나
    const drawerW = (bw - 20 - (w - 1) * 8) / w
    for (let i = 0; i < w; i++) {
      const dx = bx + 10 + i * (drawerW + 8)
      el('rect', { x: r2(dx), y: r2(by + 16), width: r2(drawerW), height: r2(bh - 28), rx: 3, fill: 'none', stroke: '#24415a', 'stroke-width': 1.5 }, shelfLayer)
      el('rect', { x: r2(dx + drawerW / 2 - 16), y: r2(by + 26), width: 32, height: 4, rx: 2, fill: '#7f93a5' }, shelfLayer)
    }
    el('rect', { x: r2(bx + 10), y: r2(by + bh - 7), width: r2(bw - 20), height: 2, rx: 1, fill: '#17a2a4', opacity: 0.45 }, shelfLayer)
  }

  // 바닥을 딛고 선 기둥
  for (const px of [gx - 14, gx + gw + 8]) {
    el('rect', { x: r2(px), y: r2(gy - 10), width: 6, height: r2(floorY - gy + 10), fill: '#7f93a5', class: 'gh-post' }, shelfLayer)
    el('rect', { x: r2(px), y: r2(gy - 10), width: 2, height: r2(floorY - gy + 10), fill: '#a9bac8' }, shelfLayer)
    el('rect', { x: r2(px - 3), y: r2(floorY - 4), width: 12, height: 4, rx: 1, fill: '#5d7488' }, shelfLayer)
  }
  // 줄마다 선반 판
  for (let row = 0; row < h; row++) {
    const y = gy + (row + 1) * c - board
    el('rect', { x: r2(gx - 18), y: r2(y + board - 1), width: r2(gw + 36), height: 4, rx: 2, fill: '#06101b', opacity: 0.5 }, shelfLayer)
    el('rect', { x: r2(gx - 18), y: r2(y), width: r2(gw + 36), height: board, rx: 2, fill: '#cfd9e1' }, shelfLayer)
    el('rect', { x: r2(gx - 18), y: r2(y + board - 2.5), width: r2(gw + 36), height: 2.5, rx: 1, fill: '#8b9dad' }, shelfLayer)
  }
}

// 벽, 천장, 바닥과 벽의 장식. 모든 것을 선반의 가운데(화면 가운데)를 기준으로 좌우 대칭이 되게 놓는다.
function buildBackground(bg: SVGGElement, L: Layout, viewW: number, named = true): void {
  const FAR = 4000
  const { floorY } = L
  const cx = viewW / 2
  const wallMid = (CEILING_Y + floorY) / 2
  // 화면 비율이 달라 남는 자리도 같은 벽과 바닥으로 채운다(SVG 밖으로 넘치게 그린다).
  el('rect', { x: -FAR, y: -FAR, width: viewW + FAR * 2, height: FAR + floorY, fill: 'url(#gh-wall)' }, bg)
  for (let k = 0; k < 12; k++) {
    for (const side of [-1, 1]) {
      el('rect', { x: r2(cx + side * (80 + k * 160) - 1), y: CEILING_Y, width: 2, height: floorY - CEILING_Y, fill: '#0c1e30', opacity: 0.7 }, bg)
    }
  }
  el('rect', { x: -FAR, y: r2(wallMid), width: viewW + FAR * 2, height: 2, fill: '#0c1e30', opacity: 0.5 }, bg)
  // 천장 띠와 배관
  el('rect', { x: -FAR, y: -FAR, width: viewW + FAR * 2, height: FAR + CEILING_Y, fill: '#09141f' }, bg)
  el('rect', { x: -FAR, y: CEILING_Y - 4, width: viewW + FAR * 2, height: 4, fill: '#2f4f69', class: 'gh-ceiling-line' }, bg)
  el('rect', { x: -FAR, y: CEILING_Y + 10, width: viewW + FAR * 2, height: 5, rx: 2, fill: '#24415a' }, bg)
  for (let k = 0; k < 9; k++) {
    for (const side of [-1, 1]) {
      el('rect', { x: r2(cx + side * (120 + k * 240) - 4), y: CEILING_Y + 7, width: 8, height: 11, rx: 2, fill: '#35566f' }, bg)
    }
  }
  // 천장 띠 왼쪽의 구역 이름. 오른쪽에는 '안내 다시 보기' 단추가 놓인다.
  if (named) {
    el('circle', { cx: 22, cy: CEILING_Y / 2 - 2, r: 4.5, fill: TEAL }, bg)
    el('text', { x: 34, y: CEILING_Y / 2 + 3.5, 'font-size': 16, fill: '#cfe9ea', class: 'gh-num' }, bg).textContent = '제3 온실'
  }

  // 바닥
  el('rect', { x: -FAR, y: floorY, width: viewW + FAR * 2, height: FAR, fill: 'url(#gh-floor)' }, bg)
  el('rect', { x: -FAR, y: floorY, width: viewW + FAR * 2, height: 3, fill: '#2f5571' }, bg)
  for (let k = 0; k < 16; k++) {
    for (const side of [-1, 1]) {
      el('rect', { x: r2(cx + side * (60 + k * 120) - 0.75), y: floorY + 3, width: 1.5, height: FAR, fill: '#0a1826', opacity: 0.8 }, bg)
    }
  }

  // 둥근 창과 환기구: 선반 양옆의 빈 벽 가운데에 하나씩 놓는다. 벽이 좁으면 줄이고, 더 좁으면 그리지 않는다.
  const gutter = L.gx - 22
  const k = Math.min(1, (gutter - 28) / (WINDOW_R * 2))
  if (k < 0.5) return
  const offset = L.c * L.w / 2 + 22 + Math.min(gutter / 2, 170)
  const cy = Math.min(wallMid - 24 * k, floorY - (WINDOW_R + 84) * k)
  for (const side of ['l', 'r'] as const) {
    const x = cx + (side === 'l' ? -offset : offset)
    buildWindow(el('g', { transform: `translate(${r2(x)} ${r2(cy)}) scale(${r2(k)})`, class: 'gh-window' }, bg), side)
  }
}

// 둥근 창 하나와 그 아래의 환기구. 창의 가운데가 원점이다. 창밖에는 별과 행성이 보인다.
function buildWindow(g: SVGGElement, side: 'l' | 'r'): void {
  const R = WINDOW_R
  const stars: [number, number, number][] = [
    [-32, -26, 1.6], [-10, -38, 1.1], [18, -30, 1.8], [34, -8, 1.2], [-38, 6, 1.2], [-18, -10, 1.4],
    [8, -14, 1], [26, 20, 1.5], [-24, 26, 1.7], [2, 36, 1.1], [-6, 12, 1.3], [36, -24, 1],
  ]
  el('circle', { r: R, fill: '#0a1826', class: 'gh-window-rim' }, g)
  el('circle', { r: R - 4, fill: '#7a93a8' }, g)
  el('circle', { r: R - 10, fill: '#4e687e' }, g)
  el('circle', { r: R - 12, fill: '#040a17' }, g)
  const view = el('g', { 'clip-path': 'url(#gh-win)' }, g)
  stars.forEach(([sx, sy, sr], i) => {
    const star = el('circle', { cx: side === 'l' ? sx : -sx, cy: sy, r: sr, fill: '#ffffff', class: 'gh-star' }, view)
    star.style.animationDelay = `${-((i * 0.73 + (side === 'l' ? 0 : 1.1)) % 4)}s`
  })
  if (side === 'l') {
    // 고리가 있는 행성
    const px = 10
    const py = 10
    el('ellipse', { cx: px, cy: py, rx: 28, ry: 7.5, fill: 'none', stroke: '#f2c14e', 'stroke-width': 3, transform: `rotate(-18 ${px} ${py})` }, view)
    el('circle', { cx: px, cy: py, r: 16, fill: '#e58f3a' }, view)
    el('path', { d: `M${px - 15} ${py - 4} q15 -7 30 2`, stroke: '#f2c14e', 'stroke-width': 3.5, fill: 'none', opacity: 0.7 }, view)
    el('path', { d: `M${px - 26.6} ${py + 8.7} A28 7.5 -18 0 0 ${px + 26.6} ${py - 8.7}`, fill: 'none', stroke: '#f2c14e', 'stroke-width': 3 }, view)
  } else {
    // 아래쪽에 걸친 큰 행성
    el('circle', { cx: -8, cy: 104, r: 84, fill: '#1c6f8f' }, view)
    el('circle', { cx: -8, cy: 108, r: 84, fill: '#15879a' }, view)
    el('path', { d: 'M-40 36 q18 -7 34 2 q-12 10 -34 -2 Z', fill: '#3fbf9a', opacity: 0.8 }, view)
    el('path', { d: 'M4 42 q13 -5 25 3 q-15 7 -25 -3 Z', fill: '#3fbf9a', opacity: 0.7 }, view)
  }
  el('path', { d: 'M-38 -20 a42 42 0 0 1 25 -22', stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none', opacity: 0.16 }, g)
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8
    el('circle', { cx: r2(Math.cos(a) * (R - 7)), cy: r2(Math.sin(a) * (R - 7)), r: 2.2, fill: '#31475b' }, g)
  }
  // 창 아래의 환기구
  el('rect', { x: -32, y: R + 28, width: 64, height: 32, rx: 5, fill: '#0c1c2c', stroke: '#2b475f', 'stroke-width': 1.5 }, g)
  for (let i = 0; i < 4; i++) el('rect', { x: -24, y: R + 35 + i * 6, width: 48, height: 2.5, rx: 1, fill: '#2b475f' }, g)
}

// ── 시작 화면의 배경 ───────────────────────────────────────────
const SHOWCASE: Crop[] = ['Daisy', 'Strawberry', 'Tulip', 'Sunflower']
export const SHOWCASE_H = BASE_H

// 본편과 같은 벽, 창, 선반에 다 자란 식물과 드론, 인트를 놓은 정지 장면을 그린다. 글자는 넣지 않는다.
// 장면의 높이는 SHOWCASE_H이고, 아래쪽 FLOOR_H만큼이 바닥이다(style.css의 .start-actions가 이 비율에 맞춰져 있다).
export function buildShowcase(root: SVGSVGElement, viewW: number): void {
  const L = makeLayout(SHOWCASE.length, 1, viewW, BASE_H)
  const { c, gx, gy, floorY } = L
  root.setAttribute('viewBox', `0 0 ${viewW} ${BASE_H}`)
  root.replaceChildren()
  buildDefs(el('defs', {}, root), L, BASE_H)
  buildBackground(el('g', { class: 'gh-bg' }, root), L, viewW, false)
  buildShelfFrame(el('g', { class: 'gh-shelf' }, root), L)

  const base = gy + c - L.board
  const potW = POT_DIM.w * L.pot
  const potH = POT_DIM.h * L.pot
  const soilY = -potH + 6.3 * L.pot
  SHOWCASE.forEach((crop, i) => {
    const g = el('g', { transform: `translate(${r2(gx + (i + 0.5) * c)} ${r2(base)})` }, root)
    const shadowW = SHADOW_DIM.w * L.pot * 1.15
    const shadowH = SHADOW_DIM.h * L.pot * 0.7
    el('image', {
      href: POT_SHADOW_SPRITE, x: r2(-shadowW / 2), y: r2(-shadowH * 0.6), width: r2(shadowW), height: r2(shadowH),
      preserveAspectRatio: 'none', opacity: 0.55,
    }, g)
    el('image', { href: POT_SPRITE, x: r2(-potW / 2), y: r2(-potH), width: r2(potW), height: r2(potH) }, g)
    el('ellipse', { cx: 0, cy: r2(soilY), rx: r2(17.2 * L.pot), ry: r2(4.3 * L.pot), fill: soilColor(6) }, g)
    const [pw, ph] = PLANT_DIM[crop][2].map(v => v * L.plant)
    el('image', { href: PLANT_SPRITES[crop][2], x: r2(-pw / 2), y: r2(soilY + L.pot * 1.2 - ph), width: r2(pw), height: r2(ph) }, g)
  })

  // 드론은 둘째 화분 위에 떠 있다. 위아래로 흔들리는 움직임은 style.css의 .start-drone이 맡는다.
  const { droneW, droneH } = L
  const drone = el('g', { transform: `translate(${r2(gx + 1.5 * c)} ${r2(gy + droneH / 2 - 4)})` }, root)
  const hover = el('g', { class: 'start-drone' }, drone)
  el('image', { href: DRONE_SPRITES.idle, x: r2(-droneW / 2), y: r2(-droneH / 2), width: r2(droneW), height: r2(droneH) }, hover)
  for (const [fx, fy, fr] of ROTORS) {
    el('ellipse', {
      cx: r2((fx - 0.5) * droneW), cy: r2((fy - 0.5) * droneH), rx: r2(fr * droneW), ry: r2(fr * droneW * 0.3), fill: '#d9fbf6', opacity: 0.6,
    }, hover)
  }

  // 선반 왼쪽 바닥에는 인트가, 오른쪽 바닥에는 출하 트럭이 선다. 벽이 좁으면 작게 그린다.
  const side = clamp(gx - 56, 60, 168)
  el('image', { href: INT_SPRITES.idle, x: r2(gx - 28 - side), y: r2(floorY + side * 0.13 - side), width: r2(side), height: r2(side) }, root)
  const truckH = side * 0.92
  el('image', {
    href: TRUCK_SPRITES.open, x: r2(gx + c * L.w + 36), y: r2(floorY + truckH * 0.04 - truckH), width: r2(truckH * TRUCK_RATIO), height: r2(truckH),
  }, root)
}

