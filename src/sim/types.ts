export type PlantKind = 'Daisy' | 'Strawberry' | 'Tulip' | 'Sunflower' | 'Tomato' | 'Crate'
export type ItemKind = PlantKind | 'Power' | 'Coin' | 'Water'
export type Dir = 'Right' | 'Left' | 'Up' | 'Down'

export const PLANT_KINDS: PlantKind[] = ['Daisy', 'Strawberry', 'Tulip', 'Sunflower', 'Tomato', 'Crate']
export const ITEM_KINDS: ItemKind[] = [...PLANT_KINDS, 'Power', 'Coin', 'Water']

export interface Cell {
  plant: PlantKind | null
  growth: number // 0~1, 1이면 다 자람
  water: number // 0~1
  wilted: boolean // 시든 토마토
  value: number // 해바라기의 꽃잎 수 또는 상자의 무게, 그 밖에는 0
}

export interface WorldState {
  w: number
  h: number
  cells: Cell[] // cells[y * w + x], (0,0)은 왼쪽 아래
  droneX: number
  droneY: number
  items: Record<ItemKind, number>
  waterCap: number
  waterTimerMs: number
  powerActions: number
  yieldMult: { Daisy: number; Strawberry: number; Tulip: number }
  rng: number
  timeMs: number
}

// 심을 때 내는 자원 하나. need의 have는 실패한 순간에 가지고 있던 수이다.
export interface CostEntry { item: ItemKind; amount: number }
export interface NeedEntry extends CostEntry { have: number }
// 실패한 까닭. 화면에서 까닭을 따로 알려 주는 경우에만 적는다.
export type FailReason = 'cost' | 'occupied' | 'water'

export type WorldEvent =
  | { type: 'move'; fromX: number; fromY: number; x: number; y: number; wrapped: boolean }
  | { type: 'harvest'; x: number; y: number; item: ItemKind; amount: number; cells: { x: number; y: number }[] }
  | { type: 'plant'; x: number; y: number; kind: PlantKind; cost: CostEntry[] }
  | { type: 'water'; x: number; y: number }
  | { type: 'swap'; x: number; y: number; dir: Dir }
  | { type: 'wilt'; x: number; y: number }
  | { type: 'fail'; x: number; y: number; reason?: FailReason; need?: NeedEntry[] }
