import { describe, expect, test } from 'vitest'
import { World } from '../../src/sim/world'
import { GROW_MS } from '../../src/sim/balance'
import type { PlantKind } from '../../src/sim/types'

const world = (n: number, seed = 1) => {
  const wd = World.create(seed)
  wd.resize(n, n)
  for (const k of ['Daisy', 'Strawberry', 'Tulip', 'Tomato'] as const) wd.state.items[k] = 10000
  return wd
}
const put = (wd: World, x: number, y: number, plant: PlantKind, value = 0, growth = 1) => {
  Object.assign(wd.cellAt(x, y), { plant, growth, value, wilted: false })
}
const goto = (wd: World, x: number, y: number) => { wd.state.droneX = x; wd.state.droneY = y }

describe('튤립', () => {
  test('이웃에 튤립이 하나 있을 때마다 성장 시간이 2배가 된다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Tulip', 0, 0)          // 이웃 없음
    put(wd, 2, 2, 'Tulip', 0, 0)          // 이웃 하나
    put(wd, 2, 1, 'Tulip', 0, 0)
    wd.advance(GROW_MS.Tulip)
    expect(wd.cellAt(0, 0).growth).toBe(1)
    expect(wd.cellAt(2, 2).growth).toBeCloseTo(0.5, 1)
  })

  test('대각선과 선반 반대편은 이웃이 아니다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Tulip', 0, 0)
    put(wd, 1, 1, 'Tulip', 0, 0)
    put(wd, 2, 0, 'Tulip', 0, 0)
    wd.advance(GROW_MS.Tulip)
    expect(wd.cellAt(0, 0).growth).toBe(1)
  })

  test('수확하면 튤립 3을 얻는다', () => {
    const wd = world(1)
    wd.state.items.Tulip = 0
    put(wd, 0, 0, 'Tulip')
    wd.harvest()
    expect(wd.state.items.Tulip).toBe(3)
  })
})

describe('해바라기', () => {
  test('심으면 꽃잎 수가 7에서 15 사이로 정해지고 measure로 잴 수 있다', () => {
    const wd = world(4)
    const seen = new Set<number>()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      goto(wd, x, y); wd.harvest(); wd.plant('Sunflower')
      const m = wd.measure()!
      expect(m).toBeGreaterThanOrEqual(7)
      expect(m).toBeLessThanOrEqual(15)
      seen.add(m)
    }
    expect(seen.size).toBeGreaterThan(2)
  })

  test('다 자란 해바라기가 10송이 이상일 때 꽃잎이 가장 많은 것을 수확하면 전력 8을 얻는다', () => {
    const wd = world(4)
    for (let i = 0; i < 10; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 7 + (i % 5))
    put(wd, 3, 3, 'Sunflower', 15)
    goto(wd, 3, 3)
    wd.harvest()
    expect(wd.state.items.Power).toBe(8)
  })

  test('가장 많은 것이 아니면 전력 1을 얻는다', () => {
    const wd = world(4)
    for (let i = 0; i < 11; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 7 + i % 3)
    put(wd, 3, 3, 'Sunflower', 15)
    goto(wd, 0, 0)
    wd.harvest()
    expect(wd.state.items.Power).toBe(1)
  })

  test('10송이 미만이면 가장 많은 것을 수확해도 전력 1을 얻는다', () => {
    const wd = world(4)
    for (let i = 0; i < 5; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 9)
    goto(wd, 0, 0)
    wd.harvest()
    expect(wd.state.items.Power).toBe(1)
  })

  test('꽃잎 수가 같은 것이 여럿이면 모두 가장 많은 것으로 본다', () => {
    const wd = world(4)
    for (let i = 0; i < 12; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 12)
    goto(wd, 1, 1)
    wd.harvest()
    expect(wd.state.items.Power).toBe(8)
  })

  test('덜 자란 해바라기는 10송이에 세지 않는다', () => {
    const wd = world(4)
    for (let i = 0; i < 9; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 9)
    put(wd, 3, 3, 'Sunflower', 9, 0.5)
    goto(wd, 0, 0)
    wd.harvest()
    expect(wd.state.items.Power).toBe(1)
  })
})

describe('전력', () => {
  test('동작을 30번 할 때마다 전력 1을 쓴다', () => {
    const wd = world(3)
    wd.state.items.Power = 2
    for (let i = 0; i < 29; i++) wd.move('Right')
    expect(wd.state.items.Power).toBe(2)
    wd.move('Right')
    expect(wd.state.items.Power).toBe(1)
  })
})

describe('토마토', () => {
  test('다 자라는 순간 약 20%가 시든다', () => {
    const wd = world(6, 7)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) put(wd, x, y, 'Tomato', 0, 0)
    let wilted = 0, total = 0
    for (let round = 0; round < 20; round++) {
      wd.advance(GROW_MS.Tomato + 100)
      for (const c of wd.state.cells) { total++; if (c.wilted) wilted++; Object.assign(c, { growth: 0, wilted: false }) }
    }
    expect(wilted / total).toBeGreaterThan(0.12)
    expect(wilted / total).toBeLessThan(0.28)
  })

  test('시든 토마토는 수확할 수 없고, 다시 심으면 교체된다', () => {
    const wd = world(1)
    put(wd, 0, 0, 'Tomato')
    wd.cellAt(0, 0).wilted = true
    expect(wd.canHarvest()).toBe(false)
    expect(wd.harvest()).toBe(false)
    expect(wd.plantType()).toBe('Tomato')
    expect(wd.plant('Tomato')).toBe(true)
    expect(wd.cellAt(0, 0).wilted).toBe(false)
    expect(wd.cellAt(0, 0).growth).toBe(0)
  })

  test('시든 토마토 자리에는 다른 작물도 심을 수 있다', () => {
    const wd = world(1)
    put(wd, 0, 0, 'Tomato')
    wd.cellAt(0, 0).wilted = true
    expect(wd.plant('Crate')).toBe(true)
    expect(wd.plantType()).toBe('Crate')
    expect(wd.cellAt(0, 0).wilted).toBe(false)
  })

  test('익은 토마토 하나는 토마토 1을 준다', () => {
    const wd = world(3)
    wd.state.items.Tomato = 0
    put(wd, 1, 1, 'Tomato')
    goto(wd, 1, 1)
    wd.harvest()
    expect(wd.state.items.Tomato).toBe(1)
  })

  test('n×n 정사각형은 한꺼번에 수확되고 n³을 준다', () => {
    const wd = world(4)
    wd.state.items.Tomato = 0
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(wd, x, y, 'Tomato')
    goto(wd, 2, 2)
    wd.harvest()
    expect(wd.state.items.Tomato).toBe(27)
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) expect(wd.cellAt(x, y).plant).toBeNull()
  })

  test('시든 토마토나 덜 익은 토마토가 끼어 있으면 그 칸을 제외한 가장 큰 정사각형만 수확한다', () => {
    const wd = world(3)
    wd.state.items.Tomato = 0
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(wd, x, y, 'Tomato')
    wd.cellAt(2, 2).wilted = true
    goto(wd, 0, 0)
    wd.harvest()
    expect(wd.state.items.Tomato).toBe(8)
    expect(wd.cellAt(2, 0).plant).toBe('Tomato')
  })

  test('6×6이면 216을 준다', () => {
    const wd = world(6)
    wd.state.items.Tomato = 0
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) put(wd, x, y, 'Tomato')
    wd.harvest()
    expect(wd.state.items.Tomato).toBe(216)
  })
})

describe('과일 상자', () => {
  test('놓으면 곧바로 수확할 수 있고 무게는 0에서 9 사이이다', () => {
    const wd = world(3)
    wd.harvest()
    expect(wd.plant('Crate')).toBe(true)
    expect(wd.canHarvest()).toBe(true)
    expect(wd.measure()).toBeGreaterThanOrEqual(0)
    expect(wd.measure()).toBeLessThanOrEqual(9)
  })

  test('measure에 방향을 주면 이웃 칸을 잰다. 상자나 해바라기가 아니면 None이다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 4)
    put(wd, 1, 0, 'Crate', 7)
    expect(wd.measure('Right')).toBe(7)
    expect(wd.measure('Up')).toBeNull()
  })

  test('swap은 이웃 칸과 내용물을 바꾸고, 선반 끝에서는 실패한다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 9)
    put(wd, 1, 0, 'Crate', 2)
    expect(wd.swap('Right')).toBe(true)
    expect(wd.measure()).toBe(2)
    expect(wd.measure('Right')).toBe(9)
    expect(wd.swap('Left')).toBe(false)
  })

  test('정리되지 않은 상자를 수확하면 그 상자만 출하되고 코인 1을 얻는다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 9)
    put(wd, 1, 0, 'Crate', 2)
    wd.harvest()
    expect(wd.state.items.Coin).toBe(1)
    expect(wd.cellAt(1, 0).plant).toBe('Crate')
  })

  test('정리된 상자를 수확하면 연결된 정리된 상자가 모두 출하되고 개수의 제곱만큼 코인을 얻는다', () => {
    const wd = world(3)
    const weights = [[1, 2, 3], [2, 3, 4], [3, 4, 9]]      // weights[y][x]
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(wd, x, y, 'Crate', weights[y][x])
    goto(wd, 1, 1)
    wd.harvest()
    expect(wd.state.items.Coin).toBe(81)
    expect(wd.state.cells.every(c => c.plant === null)).toBe(true)
  })

  test('무게가 같은 이웃은 정리된 것으로 본다', () => {
    const wd = world(2)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) put(wd, x, y, 'Crate', 5)
    wd.harvest()
    expect(wd.state.items.Coin).toBe(16)
  })

  test('정리되지 않은 상자는 묶음에 포함되지 않는다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 1); put(wd, 1, 0, 'Crate', 2); put(wd, 2, 0, 'Crate', 0)
    goto(wd, 0, 0)
    wd.harvest()
    // (1,0)은 오른쪽 이웃이 더 가벼워서 정리되지 않았다. (0,0)만 출하된다.
    expect(wd.state.items.Coin).toBe(1)
    expect(wd.cellAt(1, 0).plant).toBe('Crate')
  })
})
