import { describe, expect, test } from 'vitest'
import { World } from '../../src/sim/world'
import { largestRipeSquare, isCrateSorted, sortedCrateGroup, tulipNeighbors } from '../../src/sim/rules'
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

describe('swap 보충', () => {
  test('각 칸의 water는 그 자리에 남는다', () => {
    const wd = world(2)
    put(wd, 0, 0, 'Crate', 9); put(wd, 1, 0, 'Crate', 2)
    wd.cellAt(0, 0).water = 0.7
    wd.cellAt(1, 0).water = 0.1
    wd.swap('Right')
    expect(wd.cellAt(0, 0).water).toBe(0.7)
    expect(wd.cellAt(1, 0).water).toBe(0.1)
    expect(wd.cellAt(0, 0).value).toBe(2)
  })

  test('빈 이웃과도 바꿀 수 있다', () => {
    const wd = world(2)
    put(wd, 0, 0, 'Crate', 5, 1)
    Object.assign(wd.cellAt(1, 0), { plant: null, growth: 0, value: 0, wilted: false })
    expect(wd.swap('Right')).toBe(true)
    expect(wd.cellAt(0, 0).plant).toBeNull()
    expect(wd.cellAt(1, 0).plant).toBe('Crate')
    expect(wd.cellAt(1, 0).value).toBe(5)
  })

  test('성공하면 swap 이벤트, 실패하면 fail 이벤트를 남긴다', () => {
    const wd = world(2)
    wd.takeEvents()
    wd.swap('Right')
    wd.swap('Left')
    expect(wd.takeEvents()).toEqual([
      { type: 'swap', x: 0, y: 0, dir: 'Right' },
      { type: 'fail', x: 0, y: 0 },
    ])
  })

  test('실패해도 동작 횟수를 센다', () => {
    const wd = world(1)
    wd.state.items.Power = 1
    for (let i = 0; i < 30; i++) wd.swap('Left')
    expect(wd.state.items.Power).toBe(0)
  })

  test('swap 뒤에 상자의 정리 여부가 다시 계산된다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 9); put(wd, 1, 0, 'Crate', 2)
    expect(isCrateSorted(wd.state, 0, 0)).toBe(false)
    wd.swap('Right')
    expect(isCrateSorted(wd.state, 0, 0)).toBe(true)
    expect(isCrateSorted(wd.state, 1, 0)).toBe(true)
  })
})

describe('measure 보충', () => {
  test('상자나 해바라기가 아닌 칸은 None이다', () => {
    const wd = world(2)
    put(wd, 0, 0, 'Tulip'); put(wd, 1, 0, 'Tomato')
    expect(wd.measure()).toBeNull()
    expect(wd.measure('Right')).toBeNull()
    Object.assign(wd.cellAt(0, 1), { plant: null })
    expect(wd.measure('Up')).toBeNull()
  })

  test('선반 밖은 None이고 반대편으로 이어지지 않는다', () => {
    const wd = world(2)
    put(wd, 1, 0, 'Crate', 3)
    expect(wd.measure('Left')).toBeNull()
    goto(wd, 0, 0)
    expect(wd.measure('Left')).toBeNull()
  })

  test('해바라기의 꽃잎 수를 잰다', () => {
    const wd = world(2)
    put(wd, 0, 0, 'Sunflower', 11)
    expect(wd.measure()).toBe(11)
  })
})

describe('해바라기 수확 보충', () => {
  test('덜 자란 해바라기를 수확하면 전력 없이 사라진다', () => {
    const wd = world(2)
    put(wd, 0, 0, 'Sunflower', 9, 0.5)
    expect(wd.harvest()).toBe(false)
    expect(wd.cellAt(0, 0).plant).toBeNull()
    expect(wd.state.items.Power).toBe(0)
  })
})

describe('수확 이벤트의 cells', () => {
  test('토마토 정사각형의 모든 칸을 담는다', () => {
    const wd = world(3)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) put(wd, x, y, 'Tomato')
    wd.takeEvents()
    wd.harvest()
    const e = wd.takeEvents()[0]
    expect(e.type).toBe('harvest')
    if (e.type !== 'harvest') return
    expect(e.item).toBe('Tomato')
    expect(e.amount).toBe(8)
    expect(e.cells.map(c => `${c.x},${c.y}`).sort()).toEqual(['0,0', '0,1', '1,0', '1,1'])
  })

  test('정리된 상자 묶음의 모든 칸을 담는다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 1); put(wd, 1, 0, 'Crate', 2); put(wd, 2, 0, 'Crate', 3)
    wd.takeEvents()
    wd.harvest()
    const e = wd.takeEvents()[0]
    if (e.type !== 'harvest') throw new Error('harvest 이벤트가 아닙니다')
    expect(e.item).toBe('Coin')
    expect(e.amount).toBe(9)
    expect(e.cells.map(c => c.x).sort()).toEqual([0, 1, 2])
  })
})

describe('largestRipeSquare 보충', () => {
  test('칸이 큰 익은 영역의 가운데에 있어도 가장 큰 정사각형을 찾는다', () => {
    const wd = world(4)
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(wd, x, y, 'Tomato')
    expect(largestRipeSquare(wd.state, 1, 1)).toEqual({ x: 0, y: 0, n: 3 })
    expect(largestRipeSquare(wd.state, 2, 2)).toEqual({ x: 0, y: 0, n: 3 })
  })

  test('큰 영역 안에서도 포함해야 하는 칸 때문에 위치가 정해진다', () => {
    const wd = world(4)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) put(wd, x, y, 'Tomato')
    const r = largestRipeSquare(wd.state, 3, 1)!
    expect(r.n).toBe(2)
    expect(r.x).toBe(2)
    expect(r.y).toBe(0)
  })

  test('익지 않았거나 시들었거나 토마토가 아니면 null이다', () => {
    const wd = world(2)
    put(wd, 0, 0, 'Tomato', 0, 0.5)
    put(wd, 1, 0, 'Tomato'); wd.cellAt(1, 0).wilted = true
    put(wd, 0, 1, 'Daisy')
    expect(largestRipeSquare(wd.state, 0, 0)).toBeNull()
    expect(largestRipeSquare(wd.state, 1, 0)).toBeNull()
    expect(largestRipeSquare(wd.state, 0, 1)).toBeNull()
  })
})

describe('상자와 튤립 보충', () => {
  test('정리되지 않은 상자의 묶음은 비어 있다', () => {
    const wd = world(2)
    put(wd, 0, 0, 'Crate', 9); put(wd, 1, 0, 'Crate', 2)
    expect(sortedCrateGroup(wd.state, 0, 0)).toEqual([])
  })

  test('튤립 이웃 수는 상하좌우만 센다', () => {
    const wd = world(3)
    put(wd, 1, 1, 'Tulip')
    put(wd, 0, 1, 'Tulip'); put(wd, 1, 2, 'Tulip'); put(wd, 0, 0, 'Tulip')
    expect(tulipNeighbors(wd.state, 1, 1)).toBe(2)
    expect(tulipNeighbors(wd.state, 0, 0)).toBe(1)
  })

  test('이웃이 둘이면 성장 시간이 4배가 된다', () => {
    const wd = world(3)
    put(wd, 0, 1, 'Tulip', 0, 0); put(wd, 1, 1, 'Tulip', 0, 0); put(wd, 2, 1, 'Tulip', 0, 0)
    wd.advance(8000)
    expect(wd.cellAt(1, 1).growth).toBeCloseTo(0.25, 1)
    expect(wd.cellAt(0, 1).growth).toBeCloseTo(0.5, 1)
  })
})

describe('토마토 시듦과 결정성', () => {
  test('시드는 시듦 결과를 정한다', () => {
    const run = (seed: number) => {
      const wd = world(6, seed)
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) put(wd, x, y, 'Tomato', 0, 0)
      wd.advance(5000)
      return wd.state.cells.map(c => (c.wilted ? 1 : 0)).join('')
    }
    expect(run(3)).toBe(run(3))
    expect(run(3)).not.toBe(run(4))
  })

  test('시든 토마토는 wilt 이벤트를 남기고 더 자라지 않는다', () => {
    const wd = world(6, 7)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) put(wd, x, y, 'Tomato', 0, 0)
    wd.takeEvents()
    wd.advance(5000)
    const wilts = wd.takeEvents().filter(e => e.type === 'wilt')
    expect(wilts.length).toBe(wd.state.cells.filter(c => c.wilted).length)
    expect(wilts.length).toBeGreaterThan(0)
  })

  test('난수는 익는 순간과 심는 순간에만 쓴다', () => {
    const wd = world(2)
    const before = wd.state.rng
    wd.advance(3000)
    wd.measure(); wd.harvest(); wd.move('Right')
    expect(wd.state.rng).toBe(before)
  })

  test('토마토, 해바라기, 상자를 섞어도 같은 시드와 같은 입력은 같은 상태를 만든다', () => {
    const play = () => {
      const wd = world(4, 5)
      wd.state.items.Strawberry = 1000; wd.state.items.Sunflower = 1000
      const kinds: PlantKind[] = ['Tomato', 'Sunflower', 'Crate', 'Tomato']
      for (let i = 0; i < 80; i++) {
        wd.harvest(); wd.plant(kinds[i % 4]); wd.swap(i % 2 ? 'Up' : 'Right')
        wd.move(i % 3 ? 'Right' : 'Up'); wd.advance(900)
      }
      return JSON.stringify(wd.state) + JSON.stringify(wd.takeEvents())
    }
    expect(play()).toBe(play())
  })
})
