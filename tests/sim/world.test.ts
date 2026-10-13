import { describe, expect, test } from 'vitest'
import { World } from '../../src/sim/world'
import { GROW_MS } from '../../src/sim/balance'

const world = (w = 3, h = 3) => {
  const wd = World.create(1)
  wd.resize(w, h)
  return wd
}
const grow = (wd: World) => wd.advance(60000)

describe('시작 상태와 크기', () => {
  test('1×1 선반에 다 자란 데이지 하나로 시작한다', () => {
    const wd = World.create(1)
    expect([wd.state.w, wd.state.h]).toEqual([1, 1])
    expect(wd.plantType()).toBe('Daisy')
    expect(wd.canHarvest()).toBe(true)
  })

  test('선반을 넓혀도 기존 화분과 드론 위치가 유지된다', () => {
    const wd = World.create(1)
    wd.resize(3, 1)
    expect(wd.cellAt(0, 0).plant).toBe('Daisy')
    expect(wd.cellAt(2, 0).plant).toBeNull()
    wd.move('Right')
    wd.resize(3, 3)
    expect([wd.state.droneX, wd.state.droneY]).toEqual([1, 0])
    expect(wd.cellAt(0, 0).plant).toBe('Daisy')
  })
})

describe('선반을 줄이라는 요청', () => {
  test('더 작은 크기를 주면 그 방향으로는 줄이지 않고, 화분과 드론이 그대로 남는다', () => {
    const wd = World.create(1)
    wd.resize(6, 6)
    wd.state.droneX = 4
    wd.state.droneY = 5
    wd.cellAt(5, 5).plant = 'Tulip'
    wd.resize(4, 4)
    expect([wd.state.w, wd.state.h]).toEqual([6, 6])
    expect(wd.state.cells).toHaveLength(36)
    expect(wd.cellAt(5, 5).plant).toBe('Tulip')
    expect([wd.state.droneX, wd.state.droneY]).toEqual([4, 5])
    expect(wd.harvest()).toBe(false)
  })

  test('한 방향만 작은 크기를 주면 큰 방향만 넓힌다', () => {
    const wd = World.create(1)
    wd.resize(3, 1)
    wd.resize(1, 3)
    expect([wd.state.w, wd.state.h]).toEqual([3, 3])
    expect(wd.state.cells).toHaveLength(9)
  })
})

describe('이동', () => {
  test('네 방향으로 이동한다', () => {
    const wd = world()
    wd.move('Right'); wd.move('Up')
    expect([wd.state.droneX, wd.state.droneY]).toEqual([1, 1])
    wd.move('Left'); wd.move('Down')
    expect([wd.state.droneX, wd.state.droneY]).toEqual([0, 0])
  })

  test('선반 끝을 넘어가면 반대편으로 이어진다', () => {
    const wd = world()
    wd.move('Left')
    expect(wd.state.droneX).toBe(2)
    wd.move('Down')
    expect(wd.state.droneY).toBe(2)
    const ev = wd.takeEvents().filter(e => e.type === 'move')
    expect(ev.every(e => e.type === 'move' && e.wrapped)).toBe(true)
  })

  test('세로가 1칸이면 위로 이동해도 같은 칸이다', () => {
    const wd = world(3, 1)
    wd.move('Up')
    expect(wd.state.droneY).toBe(0)
  })
})

describe('데이지', () => {
  test('수확하면 데이지 1을 얻고, 빈 화분에는 데이지가 다시 핀다', () => {
    const wd = World.create(1)
    expect(wd.harvest()).toBe(true)
    expect(wd.state.items.Daisy).toBe(1)
    wd.advance(100)
    expect(wd.plantType()).toBe('Daisy')
    expect(wd.canHarvest()).toBe(false)
    wd.advance(GROW_MS.Daisy)
    expect(wd.canHarvest()).toBe(true)
  })

  test('다 자라지 않은 데이지는 수확되지 않고 남는다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.advance(100)
    expect(wd.harvest()).toBe(false)
    expect(wd.plantType()).toBe('Daisy')
    expect(wd.state.items.Daisy).toBe(1)
  })
})

describe('심기', () => {
  test('딸기를 심으면 데이지 1을 쓰고, 다 자라면 딸기 1을 얻는다', () => {
    const wd = World.create(1)
    wd.harvest()
    expect(wd.plant('Strawberry')).toBe(true)
    expect(wd.state.items.Daisy).toBe(0)
    expect(wd.canHarvest()).toBe(false)
    wd.advance(GROW_MS.Strawberry)
    expect(wd.canHarvest()).toBe(true)
    expect(wd.harvest()).toBe(true)
    expect(wd.state.items.Strawberry).toBe(1)
  })

  test('비용이 부족하면 심지 못한다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.plant('Strawberry')
    wd.harvest()                       // 덜 자란 딸기를 뽑는다
    expect(wd.plantType()).toBeNull()
    expect(wd.plant('Strawberry')).toBe(false)
  })

  test('자라고 있는 데이지 자리에는 다른 작물을 심을 수 있다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.advance(100)                    // 데이지가 다시 피어 자라는 중
    expect(wd.plant('Strawberry')).toBe(true)
    expect(wd.plantType()).toBe('Strawberry')
  })

  test('다른 작물이 있는 칸에는 심지 못한다', () => {
    const wd = World.create(1)
    wd.state.items.Daisy = 10
    wd.harvest()
    wd.plant('Strawberry')
    expect(wd.plant('Strawberry')).toBe(false)
    expect(wd.state.items.Daisy).toBe(10)
  })

  test('다 자라지 않은 딸기를 수확하면 작물만 사라진다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.plant('Strawberry')
    wd.advance(1000)
    expect(wd.harvest()).toBe(false)
    expect(wd.plantType()).toBeNull()
    expect(wd.state.items.Strawberry).toBe(0)
  })

  test('수확량 배율이 적용된다', () => {
    const wd = World.create(1)
    wd.state.yieldMult.Daisy = 2
    wd.harvest()
    expect(wd.state.items.Daisy).toBe(2)
  })
})

describe('물', () => {
  test('물탱크는 10초마다 1씩 차고 최대 저장량을 넘지 않는다', () => {
    const wd = World.create(1)
    wd.advance(60000)
    expect(wd.state.items.Water).toBe(0)       // 물주기를 해금하기 전에는 저장량이 0이다
    wd.state.waterCap = 3
    wd.advance(25000)
    expect(wd.state.items.Water).toBe(2)
    wd.advance(60000)
    expect(wd.state.items.Water).toBe(3)
  })

  test('물을 주면 수분이 0.25 오르고 1을 넘지 않는다', () => {
    const wd = World.create(1)
    wd.state.items.Water = 6
    expect(wd.water()).toBe(true)
    expect(wd.getWater()).toBeCloseTo(0.25)
    for (let i = 0; i < 5; i++) wd.water()
    expect(wd.getWater()).toBe(1)
    expect(wd.state.items.Water).toBe(0)
    expect(wd.water()).toBe(false)
  })

  test('수분은 시간이 지나면 줄어든다', () => {
    const wd = World.create(1)
    wd.state.items.Water = 4
    for (let i = 0; i < 4; i++) wd.water()
    wd.advance(10000)
    expect(wd.getWater()).toBeGreaterThan(0.85)
    expect(wd.getWater()).toBeLessThan(0.95)
  })

  test('수분이 가득하면 약 5배 빨리 자란다', () => {
    const wd = World.create(1)
    wd.state.items.Water = 4
    wd.harvest()
    wd.plant('Strawberry')
    for (let i = 0; i < 4; i++) wd.water()
    wd.advance(GROW_MS.Strawberry / 4)
    expect(wd.canHarvest()).toBe(true)
  })
})

describe('이벤트와 결정성', () => {
  test('동작마다 이벤트를 남기고 takeEvents로 비운다', () => {
    const wd = world()
    wd.harvest(); wd.move('Right')
    const types = wd.takeEvents().map(e => e.type)
    expect(types).toEqual(['harvest', 'move'])
    expect(wd.takeEvents()).toEqual([])
  })

  test('같은 시드와 같은 입력은 같은 상태를 만든다', () => {
    const play = () => {
      const wd = world()
      for (let i = 0; i < 50; i++) { wd.harvest(); wd.plant('Strawberry'); wd.move('Right'); wd.advance(700) }
      return JSON.stringify(wd.state)
    }
    expect(play()).toBe(play())
  })

  test('큰 시간을 한 번에 진행해도 나누어 진행한 것과 결과가 같다', () => {
    const a = world(); const b = world()
    a.state.items.Water = 2; b.state.items.Water = 2
    a.water(); b.water()
    a.advance(5000)
    for (let i = 0; i < 50; i++) b.advance(100)
    expect(a.getWater()).toBeCloseTo(b.getWater(), 6)
    grow(a); grow(b)
    expect(a.canHarvest()).toBe(b.canHarvest())
  })
})
