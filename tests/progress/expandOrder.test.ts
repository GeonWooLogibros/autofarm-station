import { describe, expect, test } from 'vitest'
import { Game } from '../../src/progress/game'
import { deserialize, serialize } from '../../src/progress/save'
import { UNLOCK_ORDER, type UnlockId } from '../../src/progress/unlocks'
import { ITEM_KINDS } from '../../src/sim/types'

const rich = (g: Game) => { for (const k of ITEM_KINDS) g.world.state.items[k] = 100000 }
const size = (g: Game) => [g.world.state.w, g.world.state.h]

// 선반 확장을 가능한 한 뒤로 미룬 구입 순서. 선행 조건은 모두 지킨다.
const LATE_EXPANSIONS: UnlockId[] = [
  'loop', 'expand1', 'cond', 'strawberry', 'var', 'tulip', 'for', 'sunflower', 'list', 'tomato', 'dict',
  'speed2', 'yieldTulip', 'expand2', 'crate', 'expand3', 'watering', 'expand4', 'func', 'speed1',
  'yieldDaisy', 'yieldStrawberry', 'automation',
]

describe('선반 확장의 구입 순서', () => {
  test('앞 단계의 선반 확장을 해금해야 다음 단계를 살 수 있다', () => {
    const g = Game.create(1)
    for (const id of UNLOCK_ORDER) if (!id.startsWith('expand') && id !== 'automation') g.unlocked.add(id)
    g.unlocked.add('expand1')
    rich(g)
    expect(g.canBuy('expand4')).toBe(false)
    expect(g.canBuy('expand3')).toBe(false)
    expect(g.buy('expand2')).toBe(true)
    expect(g.canBuy('expand4')).toBe(false)
    expect(g.buy('expand3')).toBe(true)
    expect(g.buy('expand4')).toBe(true)
    expect(size(g)).toEqual([6, 6])
  })

  test('확장을 미룬 순서로 사도 선반은 줄어들지 않고, 구입할 때마다 저장했다가 불러올 수 있다', () => {
    expect([...LATE_EXPANSIONS].sort()).toEqual([...UNLOCK_ORDER].sort())
    const g = Game.create(5)
    let area = 1
    for (const id of LATE_EXPANSIONS) {
      rich(g)
      expect(g.buy(id), id).toBe(true)
      expect(g.world.state.w * g.world.state.h, id).toBeGreaterThanOrEqual(area)
      area = g.world.state.w * g.world.state.h
      // 드론을 가장 먼 칸으로 보낸 상태에서도 저장 데이터가 유효해야 한다.
      g.world.state.droneX = g.world.state.w - 1
      g.world.state.droneY = g.world.state.h - 1
      const s = serialize(g)
      const r = deserialize(s)
      expect(r, id).not.toBeNull()
      expect(serialize(r!), id).toBe(s)
    }
    expect(size(g)).toEqual([6, 6])
  })

  // 선행 조건이 느슨하던 때에 만든 저장 데이터: 확장 4는 있고 확장 3은 없다.
  test('확장 4를 먼저 산 예전 저장 데이터에서 확장 3을 사도 선반이 줄지 않는다', () => {
    const g = Game.create(1)
    for (const id of UNLOCK_ORDER) if (id !== 'expand3' && id !== 'automation') g.unlocked.add(id)
    g.world.resize(6, 6)
    rich(g)
    g.world.state.droneX = 4
    g.world.state.droneY = 4
    g.world.cellAt(5, 5).plant = 'Tulip'
    expect(g.buy('expand3')).toBe(true)
    expect(size(g)).toEqual([6, 6])
    expect(g.world.state.cells).toHaveLength(36)
    expect(g.world.cellAt(5, 5).plant).toBe('Tulip')
    g.code = 'harvest()\nmove(Right)\nharvest()'
    g.run()
    for (let i = 0; i < 100; i++) g.tick(50)
    expect(g.status, g.output.at(-1)?.text).toBe('idle')
    const r = deserialize(serialize(g))
    expect(r).not.toBeNull()
    expect(size(r!)).toEqual([6, 6])
  })
})
