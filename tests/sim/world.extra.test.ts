import { describe, expect, test } from 'vitest'
import { World } from '../../src/sim/world'
import { POWER_ACTIONS_PER_UNIT, WATER_GROWTH_BONUS } from '../../src/sim/balance'
import { nextRandom } from '../../src/sim/rng'

describe('추가 규칙', () => {
  test('빈 칸을 수확하면 fail 이벤트와 false를 얻는다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.takeEvents()
    expect(wd.harvest()).toBe(false)
    expect(wd.takeEvents().map(e => e.type)).toEqual(['fail'])
  })

  test('데이지 자리에 데이지를 심을 수 없고, 빈 칸에는 심을 수 있다', () => {
    const wd = World.create(1)
    expect(wd.plant('Daisy')).toBe(false)
    wd.harvest()
    expect(wd.plant('Daisy')).toBe(true)
    expect(wd.cellAt(0, 0).growth).toBe(0)
  })

  test('값을 내고 심으면 plant 이벤트에 낸 자원이 적힌다', () => {
    const wd = World.create(1)
    wd.state.items.Daisy = 5
    wd.takeEvents()
    expect(wd.plant('Strawberry')).toBe(true)
    expect(wd.plant('Strawberry')).toBe(false) // 이미 딸기가 있다
    wd.cellAt(0, 0).plant = null
    expect(wd.plant('Tulip')).toBe(true)
    expect(wd.takeEvents()).toEqual([
      { type: 'plant', x: 0, y: 0, kind: 'Strawberry', cost: [{ item: 'Daisy', amount: 1 }] },
      { type: 'fail', x: 0, y: 0, reason: 'occupied' },
      { type: 'plant', x: 0, y: 0, kind: 'Tulip', cost: [{ item: 'Daisy', amount: 2 }] },
    ])
    expect(wd.state.items.Daisy).toBe(2)
  })

  test('값이 들지 않는 데이지를 심으면 cost가 비어 있다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.takeEvents()
    expect(wd.plant('Daisy')).toBe(true)
    expect(wd.takeEvents()).toEqual([{ type: 'plant', x: 0, y: 0, kind: 'Daisy', cost: [] }])
  })

  test('값을 낼 수 없으면 reason이 cost인 fail 이벤트에 모자란 자원이 적히고, 아무것도 바뀌지 않는다', () => {
    const wd = World.create(1)
    wd.state.items.Daisy = 1
    wd.takeEvents()
    expect(wd.plant('Tulip')).toBe(false)
    expect(wd.takeEvents()).toEqual([
      { type: 'fail', x: 0, y: 0, reason: 'cost', need: [{ item: 'Daisy', amount: 2, have: 1 }] },
    ])
    expect(wd.state.items.Daisy).toBe(1)
    expect(wd.plantType()).toBe('Daisy')
    wd.state.items.Daisy = 0
    expect(wd.plant('Sunflower')).toBe(false)
    expect(wd.takeEvents()).toEqual([
      { type: 'fail', x: 0, y: 0, reason: 'cost', need: [{ item: 'Strawberry', amount: 1, have: 0 }] },
    ])
  })

  test('값과 상관없는 실패에는 need가 없다', () => {
    const wd = World.create(1)
    wd.takeEvents()
    wd.harvest()
    wd.harvest() // 빈 칸
    wd.swap('Right') // 선반 바깥
    const fails = wd.takeEvents().filter(e => e.type === 'fail')
    expect(fails).toHaveLength(2)
    for (const e of fails) {
      expect(e).toEqual({ type: 'fail', x: 0, y: 0 })
      expect('reason' in e).toBe(false)
      expect('need' in e).toBe(false)
    }
  })

  test('물탱크가 비어 있으면 water()는 reason이 water인 fail 이벤트에 모자란 물을 적는다', () => {
    const wd = World.create(1)
    wd.state.waterCap = 20
    wd.takeEvents()
    expect(wd.water()).toBe(false)
    expect(wd.takeEvents()).toEqual([
      { type: 'fail', x: 0, y: 0, reason: 'water', need: [{ item: 'Water', amount: 1, have: 0 }] },
    ])
    expect(wd.getWater()).toBe(0)
    wd.state.items.Water = 2
    expect(wd.water()).toBe(true)
    expect(wd.takeEvents()).toEqual([{ type: 'water', x: 0, y: 0 }])
    expect(wd.state.items.Water).toBe(1)
  })

  test('물이 차오르는 동안에는 이벤트가 쌓이지 않는다', () => {
    const wd = World.create(1)
    wd.state.waterCap = 20
    wd.takeEvents()
    wd.advance(60000)
    expect(wd.state.items.Water).toBe(6)
    expect(wd.takeEvents()).toEqual([])
  })

  test('수분이 1이면 작물이 1 + WATER_GROWTH_BONUS배 빨리 자란다', () => {
    expect(WATER_GROWTH_BONUS).toBe(4)
    const dry = World.create(1)
    const wet = World.create(1)
    for (const wd of [dry, wet]) { wd.harvest(); wd.state.items.Daisy = 1; wd.plant('Strawberry') }
    wet.cellAt(0, 0).water = 1
    dry.advance(100)
    wet.advance(100)
    const ratio = wet.cellAt(0, 0).growth / dry.cellAt(0, 0).growth
    expect(ratio).toBeCloseTo(1 + WATER_GROWTH_BONUS, 6)
  })

  test('심기에 실패한 이벤트도 500개까지만 쌓인다', () => {
    const wd = World.create(1)
    for (let i = 0; i < 700; i++) wd.plant('Strawberry')
    const events = wd.takeEvents()
    expect(events).toHaveLength(500)
    expect(events.every(e => e.type === 'fail' && e.reason === 'cost')).toBe(true)
  })

  test('전력이 있으면 30번 동작마다 전력 1이 줄고, 0이면 줄지 않는다', () => {
    const wd = World.create(1)
    for (let i = 0; i < 40; i++) wd.move('Right')
    expect(wd.state.items.Power).toBe(0)
    expect(wd.state.powerActions).toBe(0)
    wd.state.items.Power = 2
    for (let i = 0; i < POWER_ACTIONS_PER_UNIT - 1; i++) wd.move('Right')
    expect(wd.state.items.Power).toBe(2)
    wd.move('Right')
    expect(wd.state.items.Power).toBe(1)
    expect(wd.state.powerActions).toBe(0)
  })

  test('실패한 동작도 전력을 쓴다', () => {
    const wd = World.create(1)
    wd.state.items.Power = 1
    for (let i = 0; i < POWER_ACTIONS_PER_UNIT; i++) wd.water()
    expect(wd.state.items.Power).toBe(0)
  })

  test('advance는 0, 음수, NaN, 무한대를 무시한다', () => {
    const wd = World.create(1)
    wd.harvest()
    const before = JSON.stringify(wd.state)
    for (const v of [0, -5, NaN, Infinity, -Infinity]) wd.advance(v)
    expect(JSON.stringify(wd.state)).toBe(before)
  })

  test('takeEvents를 비우지 않아도 이벤트는 500개까지만 쌓인다', () => {
    const wd = World.create(1)
    for (let i = 0; i < 700; i++) wd.move('Right')
    expect(wd.takeEvents()).toHaveLength(500)
  })

  test('swap과 measure는 아직 동작하지 않는다', () => {
    const wd = World.create(1)
    expect(wd.swap('Right')).toBe(false)
    expect(wd.measure()).toBeNull()
  })

  test('난수는 0 이상 1 미만이고 같은 상태에서 같은 값이다', () => {
    let s = 7
    for (let i = 0; i < 100; i++) {
      const r = nextRandom(s)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(1)
      s = r.state
    }
    expect(nextRandom(7)).toEqual(nextRandom(7))
  })
})
