import { describe, expect, test } from 'vitest'
import { UNLOCKS, unlockDef, canBuy, type UnlockId } from '../../src/progress/unlocks'
import { ITEM_KINDS, type ItemKind } from '../../src/sim/types'

type Row = Partial<{
  cost: Partial<Record<ItemKind, number>>; requires: UnlockId[]; features: string[]; names: string[]; plants: string[]
  size: { w: number; h: number }; speed: number; waterCap: number; yieldMult: string; title: string
}>
const TABLE: Record<UnlockId, Row> = {
  loop: { title: '반복', cost: { Daisy: 5 }, requires: [], features: ['loop'] },
  speed1: { title: '드론 속도 1', cost: { Daisy: 20 }, requires: ['loop'], speed: 1.5 },
  expand1: { title: '선반 확장 1', cost: { Daisy: 30 }, requires: ['loop'], names: ['move'], size: { w: 3, h: 1 } },
  cond: { title: '조건문', cost: { Daisy: 50 }, requires: ['expand1'], features: ['cond'], names: ['can_harvest', 'get_plant_type'] },
  strawberry: { title: '딸기', cost: { Daisy: 80 }, requires: ['cond'], names: ['plant'], plants: ['Strawberry'] },
  expand2: { title: '선반 확장 2', cost: { Strawberry: 30 }, requires: ['strawberry'], size: { w: 3, h: 3 } },
  watering: { title: '물주기', cost: { Strawberry: 80 }, requires: ['strawberry'], names: ['water', 'get_water'], waterCap: 20 },
  var: { title: '변수', cost: { Strawberry: 100 }, requires: ['strawberry'], features: ['var'], names: ['get_pos_x', 'get_pos_y', 'get_world_size', 'num_items', 'abs'] },
  func: { title: '함수', cost: { Strawberry: 100, Daisy: 100 }, requires: ['var'], features: ['func'] },
  tulip: { title: '튤립', cost: { Strawberry: 200 }, requires: ['var'], plants: ['Tulip'] },
  for: { title: 'for 반복', cost: { Tulip: 100 }, requires: ['tulip'], features: ['for'], names: ['range'] },
  expand3: { title: '선반 확장 3', cost: { Tulip: 200 }, requires: ['tulip', 'expand2'], size: { w: 4, h: 4 } },
  speed2: { title: '드론 속도 2', cost: { Tulip: 300 }, requires: ['tulip'], speed: 2 },
  sunflower: { title: '해바라기', cost: { Tulip: 400, Strawberry: 400 }, requires: ['for'], names: ['measure'], plants: ['Sunflower'] },
  list: { title: '리스트', cost: { Power: 50 }, requires: ['sunflower'], features: ['list'], names: ['len', 'min', 'max'] },
  tomato: { title: '토마토', cost: { Tulip: 800 }, requires: ['list'], plants: ['Tomato'] },
  expand4: { title: '선반 확장 4', cost: { Tomato: 300 }, requires: ['tomato', 'expand3'], size: { w: 6, h: 6 } },
  dict: { title: '딕셔너리', cost: { Tomato: 600 }, requires: ['tomato'], features: ['dict'] },
  crate: { title: '과일 상자', cost: { Tomato: 800 }, requires: ['dict'], names: ['swap'], plants: ['Crate'] },
  yieldDaisy: { title: '데이지 수확량 강화', cost: { Daisy: 200 }, requires: ['loop'], yieldMult: 'Daisy' },
  yieldStrawberry: { title: '딸기 수확량 강화', cost: { Strawberry: 200 }, requires: ['strawberry'], yieldMult: 'Strawberry' },
  yieldTulip: { title: '튤립 수확량 강화', cost: { Tulip: 200 }, requires: ['tulip'], yieldMult: 'Tulip' },
  automation: { title: '완전 자동화', cost: { Coin: 2500 }, requires: ['crate'] },
}

describe('해금 표', () => {
  test.each(UNLOCKS.map(u => [u.id]))('%s의 필드가 설계 표와 같다', id => {
    const u = unlockDef(id as UnlockId)
    const r = TABLE[id as UnlockId]
    expect(u.title).toBe(r.title)
    expect(u.cost).toEqual(r.cost)
    expect(u.requires).toEqual(r.requires)
    expect(u.features).toEqual(r.features ?? [])
    expect(u.names).toEqual(r.names ?? [])
    expect(u.plants).toEqual(r.plants ?? [])
    expect(u.size).toEqual(r.size)
    expect(u.speed).toBe(r.speed)
    expect(u.waterCap).toBe(r.waterCap)
    expect(u.yieldMult).toBe(r.yieldMult)
  })

  test('여러 자원이 드는 항목은 모두 충분해야 산다', () => {
    const items = (o: Partial<Record<ItemKind, number>>) => Object.assign(Object.fromEntries(ITEM_KINDS.map(k => [k, 0])), o) as Record<ItemKind, number>
    const have = new Set<UnlockId>(['loop', 'expand1', 'cond', 'strawberry', 'var'])
    expect(canBuy(have, items({ Strawberry: 100, Daisy: 99 }), 'func')).toBe(false)
    expect(canBuy(have, items({ Strawberry: 99, Daisy: 100 }), 'func')).toBe(false)
    expect(canBuy(have, items({ Strawberry: 100, Daisy: 100 }), 'func')).toBe(true)
  })
})
