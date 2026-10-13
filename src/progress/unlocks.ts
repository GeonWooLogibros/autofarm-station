import type { Feature } from '../lang/checker'
import { ALL_FEATURES } from '../lang/checker'
import type { ItemKind, PlantKind } from '../sim/types'

export type UnlockId =
  | 'loop' | 'speed1' | 'expand1' | 'cond' | 'strawberry' | 'expand2' | 'watering' | 'var' | 'func'
  | 'tulip' | 'for' | 'expand3' | 'speed2' | 'sunflower' | 'list' | 'tomato' | 'expand4' | 'dict'
  | 'crate' | 'yieldDaisy' | 'yieldStrawberry' | 'yieldTulip' | 'automation'

export interface UnlockDef {
  id: UnlockId
  title: string // 해금 항목 이름
  summary: string // 해금 화면에 보이는 한 줄 설명(합니다체)
  cost: Partial<Record<ItemKind, number>>
  requires: UnlockId[]
  features: Feature[]
  names: string[] // 이 항목이 여는 함수 이름
  plants: PlantKind[] // 이 항목이 여는 작물
  size?: { w: number; h: number }
  speed?: number // 드론 속도 배율(가장 큰 값이 적용된다)
  waterCap?: number
  yieldMult?: 'Daisy' | 'Strawberry' | 'Tulip'
}

const def = (d: Partial<UnlockDef> & Pick<UnlockDef, 'id' | 'title' | 'summary' | 'cost' | 'requires'>): UnlockDef =>
  ({ features: [], names: [], plants: [], ...d })

export const UNLOCKS: UnlockDef[] = [
  def({ id: 'loop', title: '반복', summary: '같은 코드를 계속 반복해서 실행할 수 있습니다.', cost: { Daisy: 5 }, requires: [], features: ['loop'] }),
  def({ id: 'speed1', title: '드론 속도 1', summary: '드론이 1.5배 빠르게 움직입니다.', cost: { Daisy: 20 }, requires: ['loop'], speed: 1.5 }),
  def({ id: 'expand1', title: '선반 확장 1', summary: '선반이 가로 3칸으로 넓어지고 드론이 이동할 수 있습니다.', cost: { Daisy: 30 }, requires: ['loop'], names: ['move'], size: { w: 3, h: 1 } }),
  def({ id: 'cond', title: '조건문', summary: '조건에 따라 다르게 행동하고, 식물이 다 자랐는지와 어떤 식물인지 확인할 수 있습니다.', cost: { Daisy: 50 }, requires: ['expand1'], features: ['cond'], names: ['can_harvest', 'get_plant_type'] }),
  def({ id: 'strawberry', title: '딸기', summary: '딸기를 심을 수 있습니다.', cost: { Daisy: 80 }, requires: ['cond'], names: ['plant'], plants: ['Strawberry'] }),
  def({ id: 'expand2', title: '선반 확장 2', summary: '선반이 3×3칸으로 넓어집니다.', cost: { Strawberry: 30 }, requires: ['strawberry'], size: { w: 3, h: 3 } }),
  def({ id: 'watering', title: '물주기', summary: '식물에 물을 주어 더 빨리 자라게 하고, 남은 물의 양을 확인할 수 있습니다.', cost: { Strawberry: 80 }, requires: ['strawberry'], names: ['water', 'get_water'], waterCap: 20 }),
  def({ id: 'var', title: '변수', summary: '값을 이름에 저장하고, 드론의 위치와 선반 크기와 가진 자원의 수를 알 수 있습니다.', cost: { Strawberry: 100 }, requires: ['strawberry'], features: ['var'], names: ['get_pos_x', 'get_pos_y', 'get_world_size', 'num_items', 'abs'] }),
  def({ id: 'func', title: '함수', summary: '자주 쓰는 코드에 이름을 붙여 필요할 때마다 불러 쓸 수 있습니다.', cost: { Strawberry: 100, Daisy: 100 }, requires: ['var'], features: ['func'] }),
  def({ id: 'tulip', title: '튤립', summary: '튤립을 심을 수 있습니다.', cost: { Strawberry: 200 }, requires: ['var'], plants: ['Tulip'] }),
  def({ id: 'for', title: 'for 반복', summary: '정해진 횟수나 목록의 항목마다 코드를 반복할 수 있습니다.', cost: { Tulip: 100 }, requires: ['tulip'], features: ['for'], names: ['range'] }),
  def({ id: 'expand3', title: '선반 확장 3', summary: '선반이 4×4칸으로 넓어집니다.', cost: { Tulip: 200 }, requires: ['tulip', 'expand2'], size: { w: 4, h: 4 } }),
  def({ id: 'speed2', title: '드론 속도 2', summary: '드론이 2배 빠르게 움직입니다.', cost: { Tulip: 300 }, requires: ['tulip'], speed: 2 }),
  def({ id: 'sunflower', title: '해바라기', summary: '해바라기를 심고, 꽃잎 수를 재어 볼 수 있습니다.', cost: { Tulip: 400, Strawberry: 400 }, requires: ['for'], names: ['measure'], plants: ['Sunflower'] }),
  def({ id: 'list', title: '리스트', summary: '여러 값을 하나로 묶어 다루고, 가장 큰 값과 작은 값을 구할 수 있습니다.', cost: { Power: 50 }, requires: ['sunflower'], features: ['list'], names: ['len', 'min', 'max'] }),
  def({ id: 'tomato', title: '토마토', summary: '토마토를 심을 수 있습니다.', cost: { Tulip: 800 }, requires: ['list'], plants: ['Tomato'] }),
  def({ id: 'expand4', title: '선반 확장 4', summary: '선반이 6×6칸으로 넓어집니다.', cost: { Tomato: 300 }, requires: ['tomato', 'expand3'], size: { w: 6, h: 6 } }),
  def({ id: 'dict', title: '딕셔너리', summary: '이름표를 붙여 값을 저장하고 찾을 수 있습니다.', cost: { Tomato: 600 }, requires: ['tomato'], features: ['dict'] }),
  def({ id: 'crate', title: '과일 상자', summary: '과일 상자를 심고, 이웃한 칸의 식물과 자리를 바꿀 수 있습니다.', cost: { Tomato: 800 }, requires: ['dict'], names: ['swap'], plants: ['Crate'] }),
  def({ id: 'yieldDaisy', title: '데이지 수확량 강화', summary: '데이지를 수확할 때 얻는 양이 늘어납니다.', cost: { Daisy: 200 }, requires: ['loop'], yieldMult: 'Daisy' }),
  def({ id: 'yieldStrawberry', title: '딸기 수확량 강화', summary: '딸기를 수확할 때 얻는 양이 늘어납니다.', cost: { Strawberry: 200 }, requires: ['strawberry'], yieldMult: 'Strawberry' }),
  def({ id: 'yieldTulip', title: '튤립 수확량 강화', summary: '튤립을 수확할 때 얻는 양이 늘어납니다.', cost: { Tulip: 200 }, requires: ['tulip'], yieldMult: 'Tulip' }),
  def({ id: 'automation', title: '완전 자동화', summary: '정거장의 온실을 완전히 자동화합니다.', cost: { Coin: 2500 }, requires: ['crate'] }),
]

export const UNLOCK_ORDER: UnlockId[] = UNLOCKS.map(u => u.id)

const BY_ID = new Map<UnlockId, UnlockDef>(UNLOCKS.map(u => [u.id, u]))

export function unlockDef(id: UnlockId): UnlockDef {
  const d = BY_ID.get(id)
  if (!d) throw new Error(`알 수 없는 해금 항목입니다: ${id}`)
  return d
}

export function canBuy(unlocked: Set<UnlockId>, items: Record<ItemKind, number>, id: UnlockId): boolean {
  if (unlocked.has(id)) return false
  const d = unlockDef(id)
  if (!d.requires.every(r => unlocked.has(r))) return false
  return (Object.keys(d.cost) as ItemKind[]).every(k => items[k] >= (d.cost[k] ?? 0))
}

export function featureTitles(): Record<Feature, string> {
  const out = {} as Record<Feature, string>
  for (const f of ALL_FEATURES) out[f] = UNLOCKS.find(u => u.features.includes(f))?.title ?? f
  return out
}

export function unlockedFeatures(unlocked: Set<UnlockId>): Set<Feature> {
  return new Set(UNLOCKS.filter(u => unlocked.has(u.id)).flatMap(u => u.features))
}

export function unlockedPlants(unlocked: Set<UnlockId>): Set<PlantKind> {
  return new Set<PlantKind>(['Daisy', ...UNLOCKS.filter(u => unlocked.has(u.id)).flatMap(u => u.plants)])
}

export function speedMultiplier(unlocked: Set<UnlockId>): number {
  return Math.max(1, ...UNLOCKS.filter(u => unlocked.has(u.id) && u.speed !== undefined).map(u => u.speed!))
}
