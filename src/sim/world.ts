import {
  BASE_YIELD, GROW_MS, POWER_ACTIONS_PER_UNIT, SUNFLOWER_BONUS, SUNFLOWER_MIN_COUNT,
  WATER_DECAY_PER_SEC, WATER_FILL_MS, WATER_GROWTH_BONUS, WATER_PER_USE, WILT_CHANCE, plantCost,
} from './balance'
import { nextRandom } from './rng'
import { largestRipeSquare, sortedCrateGroup, tulipNeighbors } from './rules'
import { ITEM_KINDS } from './types'
import type { Cell, Dir, FailReason, ItemKind, NeedEntry, PlantKind, WorldEvent, WorldState } from './types'

const STEP_MS = 100
const MAX_EVENTS = 500
const GROWTH_EPSILON = 1e-9

const emptyCell = (): Cell => ({ plant: null, growth: 0, water: 0, wilted: false, value: 0 })

const DELTA: Record<Dir, [number, number]> = { Right: [1, 0], Left: [-1, 0], Up: [0, 1], Down: [0, -1] }

export class World {
  state: WorldState
  private events: WorldEvent[] = []

  constructor(state: WorldState) {
    this.state = state
  }

  static create(seed: number): World {
    const items = {} as Record<ItemKind, number>
    for (const k of ITEM_KINDS) items[k] = 0
    return new World({
      w: 1, h: 1,
      cells: [{ plant: 'Daisy', growth: 1, water: 0, wilted: false, value: 0 }],
      droneX: 0, droneY: 0,
      items,
      waterCap: 0, waterTimerMs: 0,
      powerActions: 0,
      yieldMult: { Daisy: 1, Strawberry: 1, Tulip: 1 },
      rng: seed, timeMs: 0,
    })
  }

  cellAt(x: number, y: number): Cell {
    return this.state.cells[y * this.state.w + x]
  }

  private here(): Cell {
    return this.cellAt(this.state.droneX, this.state.droneY)
  }

  // 선반을 넓힌다. 지금보다 작은 크기를 주면 그 방향으로는 줄이지 않는다(화분이 사라지거나 드론이 선반 밖에 남지 않게 한다).
  resize(width: number, height: number): void {
    const old = this.state
    const w = Math.max(old.w, width)
    const h = Math.max(old.h, height)
    const cells: Cell[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        cells.push(x < old.w && y < old.h ? old.cells[y * old.w + x] : emptyCell())
      }
    }
    old.w = w
    old.h = h
    old.cells = cells
  }

  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return
    let left = ms
    while (left > 0) {
      const dt = Math.min(STEP_MS, left)
      left -= dt
      this.step(dt)
    }
  }

  private step(dt: number): void {
    const s = this.state
    s.timeMs += dt
    if (s.waterCap > 0) {
      s.waterTimerMs += dt
      while (s.waterTimerMs >= WATER_FILL_MS) {
        s.waterTimerMs -= WATER_FILL_MS
        s.items.Water = Math.min(s.waterCap, s.items.Water + 1)
      }
    }
    const decay = (1 - WATER_DECAY_PER_SEC) ** (dt / 1000)
    for (let i = 0; i < s.cells.length; i++) {
      const c = s.cells[i]
      if (c.plant === null) {
        c.plant = 'Daisy'
        c.growth = 0
        c.wilted = false
        c.value = 0
      }
      if (c.plant !== null && c.growth < 1 && !c.wilted) {
        const x = i % s.w
        const y = (i - x) / s.w
        const tulipFactor = c.plant === 'Tulip' ? 2 ** tulipNeighbors(s, x, y) : 1
        c.growth += (dt / (GROW_MS[c.plant] * tulipFactor)) * (1 + WATER_GROWTH_BONUS * c.water)
        if (c.growth > 1 - GROWTH_EPSILON) {
          c.growth = 1
          if (c.plant === 'Tomato' && this.random() < WILT_CHANCE) {
            c.wilted = true
            this.emit({ type: 'wilt', x, y })
          }
        }
      }
      c.water *= decay
    }
  }

  private random(): number {
    const r = nextRandom(this.state.rng)
    this.state.rng = r.state
    return r.value
  }

  private emit(e: WorldEvent): void {
    this.events.push(e)
    if (this.events.length > MAX_EVENTS) this.events.shift()
  }

  takeEvents(): WorldEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  private useAction(): void {
    const s = this.state
    if (s.items.Power > 0) {
      s.powerActions++
      if (s.powerActions >= POWER_ACTIONS_PER_UNIT) {
        s.items.Power--
        s.powerActions = 0
      }
    }
  }

  private fail(reason?: FailReason, need?: NeedEntry[]): false {
    const e: Extract<WorldEvent, { type: 'fail' }> = { type: 'fail', x: this.state.droneX, y: this.state.droneY }
    if (reason !== undefined) e.reason = reason
    if (need !== undefined) e.need = need
    this.emit(e)
    return false
  }

  private clearCell(c: Cell): void {
    c.plant = null
    c.growth = 0
    c.wilted = false
    c.value = 0
  }

  move(dir: Dir): boolean {
    this.useAction()
    const s = this.state
    const [dx, dy] = DELTA[dir]
    const fromX = s.droneX
    const fromY = s.droneY
    const rx = fromX + dx
    const ry = fromY + dy
    const x = (rx + s.w) % s.w
    const y = (ry + s.h) % s.h
    const wrapped = x !== rx || y !== ry || (x === fromX && y === fromY)
    s.droneX = x
    s.droneY = y
    this.emit({ type: 'move', fromX, fromY, x, y, wrapped })
    return true
  }

  canHarvest(): boolean {
    const c = this.here()
    return c.plant !== null && c.growth >= 1 && !c.wilted
  }

  plantType(): PlantKind | null {
    return this.here().plant
  }

  getWater(): number {
    return this.here().water
  }

  harvest(): boolean {
    this.useAction()
    const s = this.state
    const c = this.here()
    const plant = c.plant
    if (plant === null || (plant === 'Tomato' && c.wilted)) return this.fail()
    if (c.growth < 1) {
      if (plant === 'Daisy') return this.fail()
      this.clearCell(c)
      return this.fail()
    }
    let item: ItemKind
    let amount: number
    let cells = [{ x: s.droneX, y: s.droneY }]
    if (plant === 'Daisy' || plant === 'Strawberry' || plant === 'Tulip') {
      item = plant
      amount = BASE_YIELD[plant] * s.yieldMult[plant]
    } else if (plant === 'Sunflower') {
      let ripe = 0
      let maxPetals = 0
      for (const o of s.cells) {
        if (o.plant === 'Sunflower' && o.growth >= 1) {
          ripe++
          if (o.value > maxPetals) maxPetals = o.value
        }
      }
      item = 'Power'
      amount = ripe >= SUNFLOWER_MIN_COUNT && c.value === maxPetals ? SUNFLOWER_BONUS : 1
    } else if (plant === 'Tomato') {
      const sq = largestRipeSquare(s, s.droneX, s.droneY)
      if (sq === null) return this.fail()
      cells = []
      for (let j = 0; j < sq.n; j++) for (let i = 0; i < sq.n; i++) cells.push({ x: sq.x + i, y: sq.y + j })
      item = 'Tomato'
      amount = sq.n ** 3
    } else {
      const group = sortedCrateGroup(s, s.droneX, s.droneY)
      if (group.length > 0) cells = group
      item = 'Coin'
      amount = group.length > 0 ? group.length ** 2 : 1
    }
    s.items[item] += amount
    for (const p of cells) this.clearCell(this.cellAt(p.x, p.y))
    this.emit({ type: 'harvest', x: s.droneX, y: s.droneY, item, amount, cells })
    return true
  }

  plant(kind: PlantKind): boolean {
    this.useAction()
    const s = this.state
    const c = this.here()
    const free = c.plant === null || (c.plant === 'Daisy' && kind !== 'Daisy') || (c.plant === 'Tomato' && c.wilted)
    if (!free) return this.fail('occupied')
    const cost = plantCost(kind)
    const need = cost.filter(e => s.items[e.item] < e.amount).map(e => ({ ...e, have: s.items[e.item] }))
    if (need.length > 0) return this.fail('cost', need)
    for (const e of cost) s.items[e.item] -= e.amount
    c.plant = kind
    c.growth = GROW_MS[kind] === 0 ? 1 : 0
    c.wilted = false
    c.value = kind === 'Sunflower' ? 7 + Math.floor(this.random() * 9)
      : kind === 'Crate' ? Math.floor(this.random() * 10)
      : 0
    this.emit({ type: 'plant', x: s.droneX, y: s.droneY, kind, cost })
    return true
  }

  water(): boolean {
    this.useAction()
    const s = this.state
    if (s.items.Water < 1) return this.fail('water', [{ item: 'Water', amount: 1, have: s.items.Water }])
    s.items.Water--
    const c = this.here()
    c.water = Math.min(1, c.water + WATER_PER_USE)
    this.emit({ type: 'water', x: s.droneX, y: s.droneY })
    return true
  }

  swap(dir: Dir): boolean {
    this.useAction()
    const s = this.state
    const [dx, dy] = DELTA[dir]
    const nx = s.droneX + dx
    const ny = s.droneY + dy
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) return this.fail()
    const a = this.here()
    const b = this.cellAt(nx, ny)
    const { plant, growth, wilted, value } = a
    Object.assign(a, { plant: b.plant, growth: b.growth, wilted: b.wilted, value: b.value })
    Object.assign(b, { plant, growth, wilted, value })
    this.emit({ type: 'swap', x: s.droneX, y: s.droneY, dir })
    return true
  }

  measure(dir?: Dir): number | null {
    const s = this.state
    let c: Cell = this.here()
    if (dir !== undefined) {
      const [dx, dy] = DELTA[dir]
      const nx = s.droneX + dx
      const ny = s.droneY + dy
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) return null
      c = this.cellAt(nx, ny)
    }
    return c.plant === 'Sunflower' || c.plant === 'Crate' ? c.value : null
  }
}
