import { POWER_ACTIONS_PER_UNIT, WATER_FILL_MS } from '../sim/balance'
import { ITEM_KINDS, PLANT_KINDS } from '../sim/types'
import type { Cell, ItemKind, PlantKind, WorldState } from '../sim/types'
import { World } from '../sim/world'
import { Game, type Settings } from './game'
import { UNLOCK_ORDER, type UnlockId } from './unlocks'

export const SAVE_KEY = 'gardener-replaced:save:v1'
export const CORRUPT_KEY = 'gardener-replaced:save:corrupt'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface SaveData {
  version: 1
  code: string
  unlocked: UnlockId[]
  world: WorldState
  playMs: number
  finishedAtMs: number | null
  settings: Settings
  seenGuides: UnlockId[]
}

const MAX_SIDE = 6
const MAX_CELL_VALUE = 15

export function serialize(game: Game): string {
  const s = game.world.state
  const items = {} as Record<ItemKind, number>
  for (const k of ITEM_KINDS) items[k] = s.items[k]
  const data: SaveData = {
    version: 1,
    code: game.code,
    unlocked: [...game.unlocked],
    world: {
      w: s.w, h: s.h,
      cells: s.cells.map(c => ({ plant: c.plant, growth: c.growth, water: c.water, wilted: c.wilted, value: c.value })),
      droneX: s.droneX, droneY: s.droneY,
      items,
      waterCap: s.waterCap, waterTimerMs: s.waterTimerMs, powerActions: s.powerActions,
      yieldMult: { Daisy: s.yieldMult.Daisy, Strawberry: s.yieldMult.Strawberry, Tulip: s.yieldMult.Tulip },
      rng: s.rng, timeMs: s.timeMs,
    },
    playMs: game.playMs,
    finishedAtMs: game.finishedAtMs,
    settings: { guide: game.settings.guide, sound: game.settings.sound },
    seenGuides: [...game.seenGuides],
  }
  return JSON.stringify(data)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNonNeg = (v: unknown): v is number => isNum(v) && v >= 0
const isUnit = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

function parseUnlockList(v: unknown): UnlockId[] | null {
  if (!Array.isArray(v)) return null
  const out: UnlockId[] = []
  for (const id of v) {
    if (typeof id !== 'string' || !(UNLOCK_ORDER as string[]).includes(id)) return null
    if (!out.includes(id as UnlockId)) out.push(id as UnlockId)
  }
  return out
}

function parseCell(v: unknown): Cell | null {
  if (!isObj(v)) return null
  const { plant, growth, water, wilted, value } = v
  if (plant !== null && !(typeof plant === 'string' && (PLANT_KINDS as string[]).includes(plant))) return null
  if (!isUnit(growth) || !isUnit(water) || typeof wilted !== 'boolean') return null
  // 꽃잎 수(7~15)와 상자 무게(0~9)를 담는 값이다.
  if (!isInt(value, 0, MAX_CELL_VALUE)) return null
  // 시드는 것은 다 자란 토마토뿐이다.
  if (wilted && !(plant === 'Tomato' && growth >= 1)) return null
  return { plant: plant as PlantKind | null, growth, water, wilted, value }
}

function parseWorld(v: unknown): WorldState | null {
  if (!isObj(v)) return null
  const { w, h, cells, droneX, droneY, items, yieldMult } = v
  if (!isInt(w, 1, MAX_SIDE) || !isInt(h, 1, MAX_SIDE)) return null
  if (!Array.isArray(cells) || cells.length !== w * h) return null
  if (!isInt(droneX, 0, w - 1) || !isInt(droneY, 0, h - 1)) return null
  if (!isObj(items) || !isObj(yieldMult)) return null
  const { waterCap, waterTimerMs, powerActions, rng, timeMs } = v
  if (!isInt(waterCap, 0, Number.MAX_SAFE_INTEGER)) return null
  if (!isNonNeg(waterTimerMs) || waterTimerMs >= WATER_FILL_MS) return null
  if (!isInt(powerActions, 0, POWER_ACTIONS_PER_UNIT - 1)) return null
  if (!isNum(rng) || !Number.isInteger(rng) || !isNonNeg(timeMs)) return null
  const outCells: Cell[] = []
  for (const c of cells) {
    const cell = parseCell(c)
    if (!cell) return null
    outCells.push(cell)
  }
  const outItems = {} as Record<ItemKind, number>
  for (const k of ITEM_KINDS) {
    const n = items[k]
    if (!isNonNeg(n)) return null
    outItems[k] = n
  }
  const { Daisy, Strawberry, Tulip } = yieldMult
  // 수확량 강화는 배율을 2로 만들 뿐이다.
  for (const m of [Daisy, Strawberry, Tulip]) if (m !== 1 && m !== 2) return null
  return {
    w, h, cells: outCells, droneX, droneY, items: outItems,
    waterCap, waterTimerMs, powerActions,
    yieldMult: { Daisy: Daisy as number, Strawberry: Strawberry as number, Tulip: Tulip as number },
    rng, timeMs,
  }
}

export function deserialize(json: string): Game | null {
  try {
    const data: unknown = JSON.parse(json)
    if (!isObj(data) || data.version !== 1) return null
    const { code, playMs, finishedAtMs, settings } = data
    if (typeof code !== 'string' || !isNonNeg(playMs)) return null
    if (finishedAtMs !== null && !isNum(finishedAtMs)) return null
    if (!isObj(settings) || typeof settings.guide !== 'boolean' || typeof settings.sound !== 'boolean') return null
    const unlocked = parseUnlockList(data.unlocked)
    const seenGuides = parseUnlockList(data.seenGuides)
    const state = parseWorld(data.world)
    if (!unlocked || !seenGuides || !state) return null

    const game = Game.create(0)
    game.world = new World(state)
    game.code = code
    game.unlocked = new Set(unlocked)
    game.seenGuides = new Set(seenGuides)
    game.playMs = playMs
    game.finishedAtMs = finishedAtMs
    game.settings = { guide: settings.guide, sound: settings.sound }
    return game
  } catch {
    return null
  }
}

export function loadGame(storage: StorageLike, seed: number): Game {
  try {
    const raw = storage.getItem(SAVE_KEY)
    if (raw === null) return Game.create(seed)
    const game = deserialize(raw)
    if (game) return game
    try { storage.setItem(CORRUPT_KEY, raw) } catch { /* 보관하지 못해도 새 게임은 시작한다 */ }
  } catch { /* 저장소를 읽을 수 없으면 새 게임으로 시작한다 */ }
  return Game.create(seed)
}

export function saveGame(storage: StorageLike, game: Game): boolean {
  try {
    storage.setItem(SAVE_KEY, serialize(game))
    return true
  } catch {
    return false
  }
}

export function resetGame(storage: StorageLike): void {
  for (const key of [SAVE_KEY, CORRUPT_KEY]) {
    try { storage.removeItem(key) } catch { /* 지울 수 없어도 계속한다 */ }
  }
}
