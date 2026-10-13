import { describe, expect, test } from 'vitest'
import { Game } from '../../src/progress/game'
import { deserialize, serialize } from '../../src/progress/save'

const base = () => JSON.parse(serialize(Game.create(1)))
const edit = (fn: (o: any) => void) => { const o = base(); fn(o); return JSON.stringify(o) }

describe('저장 데이터 검증', () => {
  test.each([
    ['숫자', '5'], ['배열', '[]'], ['문자열', '"abc"'], ['null', 'null'], ['true', 'true'],
  ])('JSON이 %s로 읽혀도 던지지 않고 null을 돌려준다', (_n, json) => {
    expect(() => deserialize(json)).not.toThrow()
    expect(deserialize(json)).toBeNull()
  })

  test.each([
    ['growth가 null(NaN)', (o: any) => { o.world.cells[0].growth = null }],
    ['water가 null(Infinity)', (o: any) => { o.world.cells[0].water = null }],
    ['value가 null', (o: any) => { o.world.cells[0].value = null }],
    ['rng가 null', (o: any) => { o.world.rng = null }],
    ['playMs가 음수', (o: any) => { o.playMs = -1 }],
    ['자원이 음수', (o: any) => { o.world.items.Coin = -1 }],
    ['시든 값이 불리언이 아님', (o: any) => { o.world.cells[0].wilted = 1 }],
    ['알 수 없는 작물', (o: any) => { o.world.cells[0].plant = 'Cactus' }],
    ['드론이 선반 밖', (o: any) => { o.world.droneX = 1 }],
    ['선반이 7칸 이상', (o: any) => { o.world.w = 7; o.world.h = 7; o.world.cells = Array(49).fill(o.world.cells[0]) }],
    ['settings 없음', (o: any) => { delete o.settings }],
    ['world가 배열', (o: any) => { o.world = [] }],
    ['waterTimerMs가 매우 큼', (o: any) => { o.world.waterCap = 20; o.world.waterTimerMs = 1e300 }],
    ['waterTimerMs가 음수', (o: any) => { o.world.waterTimerMs = -1 }],
    ['waterCap이 정수가 아님', (o: any) => { o.world.waterCap = 1.5 }],
    ['water가 음수', (o: any) => { o.world.cells[0].water = -1 }],
    ['water가 1 초과', (o: any) => { o.world.cells[0].water = 2 }],
    ['growth가 1 초과', (o: any) => { o.world.cells[0].growth = 2 }],
    ['growth가 음수', (o: any) => { o.world.cells[0].growth = -0.1 }],
    ['powerActions가 음수', (o: any) => { o.world.powerActions = -5 }],
    ['powerActions가 한도 이상', (o: any) => { o.world.powerActions = 30 }],
    ['수확량 배율이 0', (o: any) => { o.world.yieldMult.Daisy = 0 }],
    ['timeMs가 음수', (o: any) => { o.world.timeMs = -1 }],
    ['value가 음수', (o: any) => { o.world.cells[0].value = -1 }],
    ['rng가 정수가 아님', (o: any) => { o.world.rng = 1.5 }],
    ['cell이 null', (o: any) => { o.world.cells[0] = null }],
    ['수확량 배율이 3', (o: any) => { o.world.yieldMult.Tulip = 3 }],
    ['수확량 배율이 1.5', (o: any) => { o.world.yieldMult.Strawberry = 1.5 }],
    ['value가 16', (o: any) => { o.world.cells[0].value = 16 }],
    ['value가 정수가 아님', (o: any) => { o.world.cells[0].value = 2.5 }],
    ['데이지가 시들어 있음', (o: any) => { o.world.cells[0].wilted = true }],
    ['빈 칸이 시들어 있음', (o: any) => { o.world.cells[0].plant = null; o.world.cells[0].wilted = true }],
    ['다 자라지 않은 토마토가 시들어 있음', (o: any) => { Object.assign(o.world.cells[0], { plant: 'Tomato', growth: 0.5, wilted: true }) }],
  ])('%s이면 null을 돌려준다', (_n, fn) => {
    expect(deserialize(edit(fn))).toBeNull()
  })

  test('시뮬레이션이 실제로 만드는 값은 받아들인다', () => {
    const g = deserialize(edit(o => {
      o.world.yieldMult = { Daisy: 2, Strawberry: 1, Tulip: 2 }
      Object.assign(o.world.cells[0], { plant: 'Tomato', growth: 1, wilted: true, value: 0 })
    }))
    expect(g).not.toBeNull()
    expect(g!.world.cellAt(0, 0).wilted).toBe(true)
    expect(deserialize(edit(o => { Object.assign(o.world.cells[0], { plant: 'Sunflower', growth: 0.3, value: 15 }) }))).not.toBeNull()
    expect(deserialize(edit(o => { Object.assign(o.world.cells[0], { plant: 'Crate', growth: 1, value: 0 }) }))).not.toBeNull()
  })

  test('중복된 해금은 하나로 합치고, 모르는 필드는 무시한다', () => {
    const g = deserialize(edit(o => { o.unlocked = ['loop', 'loop']; o.extra = 1; o.world.extra = 2 }))!
    expect([...g.unlocked]).toEqual(['loop'])
  })

  test('불러온 게임은 파싱된 JSON과 참조를 공유하지 않는다', () => {
    const o = base()
    const g = deserialize(JSON.stringify(o))!
    g.world.state.items.Daisy = 99
    g.world.state.cells[0].growth = 0.5
    expect(o.world.items.Daisy).toBe(0)
    expect(o.world.cells[0].growth).toBe(1)
  })

  test('저장, 불러오기, 저장을 거쳐도 문자열이 같다', () => {
    const g = Game.create(3)
    g.world.state.items.Daisy = 500
    g.buy('loop'); g.buy('expand1')
    g.seenGuides.add('loop')
    g.run()
    for (let i = 0; i < 50; i++) g.tick(50)
    const s = serialize(g)
    expect(serialize(deserialize(s)!)).toBe(s)
  })

  test('오래 플레이한 게임(해금, 물, 전력, 시든 토마토)도 그대로 저장된다', () => {
    const g = Game.create(7)
    const items = g.world.state.items
    items.Daisy = 2000; items.Strawberry = 2000; items.Tulip = 2000; items.Tomato = 2000; items.Coin = 100
    for (const id of ['loop', 'expand1', 'cond', 'strawberry', 'expand2', 'watering', 'var', 'tulip', 'expand3', 'yieldDaisy', 'yieldStrawberry', 'yieldTulip'] as const) {
      expect(g.buy(id)).toBe(true)
    }
    items.Power = 3
    const st = g.world.state
    for (const c of st.cells) { c.plant = 'Tomato'; c.growth = 0.99 }
    g.code = 'while True:\n    water()\n    plant(Tomato)\n    harvest()\n    move(Right)\n    move(Up)'
    g.run()
    for (let i = 0; i < 4000; i++) g.tick(50)
    expect(st.waterCap).toBeGreaterThan(0)
    expect(st.cells.some(c => c.wilted)).toBe(true)
    const s = serialize(g)
    const r = deserialize(s)
    expect(r).not.toBeNull()
    expect(serialize(r!)).toBe(s)
  })
})
