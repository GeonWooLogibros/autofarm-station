import type { CostEntry, ItemKind, PlantKind } from './types'

// 균형에 관련된 수치. 값을 바꾸면 tests/balance.test.ts로 엔딩까지 걸리는 시간을 다시 확인한다.
export const GROW_MS: Record<PlantKind, number> = {
  Daisy: 2000, Strawberry: 6000, Tulip: 8000, Sunflower: 6000, Tomato: 4000, Crate: 0,
}
export const PLANT_COST: Record<PlantKind, Partial<Record<ItemKind, number>>> = {
  Daisy: {}, Strawberry: { Daisy: 1 }, Tulip: { Daisy: 2 }, Sunflower: { Strawberry: 1 },
  Tomato: { Tulip: 1 }, Crate: { Tomato: 1 },
}
// 작물 하나를 심을 때 내는 자원의 목록. 값이 들지 않으면 빈 목록이다.
export function plantCost(kind: PlantKind): CostEntry[] {
  return (Object.entries(PLANT_COST[kind]) as [ItemKind, number][]).map(([item, amount]) => ({ item, amount }))
}
export const BASE_YIELD = { Daisy: 1, Strawberry: 1, Tulip: 3 }
export const WATER_PER_USE = 0.25
export const WATER_GROWTH_BONUS = 4 // 수분이 1일 때 자라는 속도에 더해지는 배수(1 + 4 = 5배)
export const WATER_FILL_MS = 10000
export const WATER_DECAY_PER_SEC = 0.01
export const WILT_CHANCE = 0.2
export const POWER_ACTIONS_PER_UNIT = 30
export const SUNFLOWER_MIN_COUNT = 10
export const SUNFLOWER_BONUS = 8
