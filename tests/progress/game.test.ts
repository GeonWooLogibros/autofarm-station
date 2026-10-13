import { describe, expect, test } from 'vitest'
import { Game, MAX_OUTPUT_LINES } from '../../src/progress/game'
import { UNLOCK_ORDER } from '../../src/progress/unlocks'

const simulate = (g: Game, ms: number, frame = 50) => { for (let t = 0; t < ms; t += frame) g.tick(frame) }
const full = () => {
  const g = Game.create(1)
  for (const id of UNLOCK_ORDER) if (id !== 'automation') { g.unlocked.add(id) }
  g.world.resize(6, 6)
  return g
}

describe('실행 제어', () => {
  test('처음 코드는 harvest() 한 줄이고, 실행하면 데이지 1을 얻는다', () => {
    const g = Game.create(1)
    expect(g.code.trim()).toBe('harvest()')
    expect(g.run()).toBe(true)
    expect(g.status).toBe('running')
    simulate(g, 1000)
    expect(g.world.state.items.Daisy).toBe(1)
    expect(g.status).toBe('idle')
    expect(g.currentLine).toBe(0)
  })

  test('동작 하나에 0.5초가 걸린다', () => {
    const g = full()
    g.code = 'while True:\n    move(Right)'
    g.run()
    simulate(g, 5000)
    const moves = g.world.takeEvents().filter(e => e.type === 'move').length
    expect(moves).toBeGreaterThanOrEqual(9)
    expect(moves).toBeLessThanOrEqual(21)      // 속도 2 해금 상태이므로 초당 최대 4번
  })

  test('속도 강화와 전력이 초당 틱에 반영된다', () => {
    const g = Game.create(1)
    expect(g.ticksPerSecond()).toBe(400)
    g.unlocked.add('speed1')
    expect(g.ticksPerSecond()).toBe(600)
    g.world.state.items.Power = 1
    expect(g.ticksPerSecond()).toBe(1200)
  })

  test('구문 오류는 실행하지 않고 출력과 오류 줄로 알린다', () => {
    const g = full()
    g.code = 'harvest()\nwhile True\n    harvest()'
    expect(g.run()).toBe(false)
    expect(g.status).toBe('error')
    expect(g.errorLine).toBe(2)
    expect(g.output.at(-1)!.kind).toBe('error')
    expect(g.output.at(-1)!.text).toContain('2번째 줄')
  })

  test('실행 중 오류가 나면 멈추고 온실 상태는 유지된다', () => {
    const g = full()
    g.code = 'harvest()\nx = 1 / 0\nharvest()'
    g.run()
    simulate(g, 3000)
    expect(g.status).toBe('error')
    expect(g.errorLine).toBe(2)
    expect(g.world.state.items.Daisy).toBe(1)
  })

  test('다시 실행하면 오류 표시가 지워진다', () => {
    const g = full()
    g.code = 'x = 1 / 0'
    g.run(); simulate(g, 500)
    g.code = 'harvest()'
    expect(g.run()).toBe(true)
    expect(g.errorLine).toBe(0)
  })

  test('정지하면 프로그램이 멈추고 식물은 계속 자란다', () => {
    const g = Game.create(1)
    g.unlocked.add('loop')
    g.code = 'while True:\n    harvest()'
    g.run(); simulate(g, 1000)
    g.stop()
    expect(g.status).toBe('idle')
    const before = g.world.state.items.Daisy
    simulate(g, 5000)
    expect(g.world.state.items.Daisy).toBe(before)
    expect(g.world.canHarvest()).toBe(true)
  })

  test('한 단계 실행은 문장 하나만 실행하고 멈춘 상태로 남는다', () => {
    const g = full()
    g.code = 'print(1)\nprint(2)'
    g.stepOnce()
    expect(g.output.filter(o => o.kind === 'print').map(o => o.text)).toEqual(['1'])
    expect(g.paused).toBe(true)
    expect(g.currentLine).toBe(2)
    simulate(g, 2000)
    expect(g.output.filter(o => o.kind === 'print').length).toBe(1)
    g.stepOnce()
    expect(g.output.filter(o => o.kind === 'print').map(o => o.text)).toEqual(['1', '2'])
  })

  test('멈춘 상태에서 실행하기를 누르면 이어서 실행한다', () => {
    const g = full()
    g.code = 'print(1)\nprint(2)\nprint(3)'
    g.stepOnce()
    g.run()
    simulate(g, 1000)
    expect(g.output.filter(o => o.kind === 'print').map(o => o.text)).toEqual(['1', '2', '3'])
  })
})

describe('견고성', () => {
  test('한 프레임의 경과 시간이 매우 커도 250ms만 진행한다', () => {
    const g = Game.create(1)
    g.tick(10 * 60 * 1000)
    expect(g.playMs).toBe(250)
    expect(g.world.state.timeMs).toBe(250)
  })

  test('음수나 NaN 경과 시간은 무시한다', () => {
    const g = Game.create(1)
    g.tick(-5); g.tick(NaN)
    expect(g.playMs).toBe(0)
  })

  test('무한 반복에서 print를 호출해도 출력은 200줄을 넘지 않는다', () => {
    const g = full()
    g.code = 'i = 0\nwhile True:\n    print(i)\n    i += 1'
    g.run()
    simulate(g, 20000)
    expect(g.output.length).toBeLessThanOrEqual(MAX_OUTPUT_LINES)
    expect(Number(g.output.at(-1)!.text)).toBeGreaterThan(MAX_OUTPUT_LINES)
  })

  test('실행 중에 선반을 확장해도 프로그램이 계속 실행된다', () => {
    const g = Game.create(1)
    g.unlocked.add('loop')
    g.world.state.items.Daisy = 1000
    g.code = 'while True:\n    harvest()'
    g.run(); simulate(g, 1000)
    expect(g.buy('expand1')).toBe(true)
    simulate(g, 3000)
    expect(g.status).toBe('running')
    expect(g.world.state.w).toBe(3)
    expect([g.world.state.droneX, g.world.state.droneY]).toEqual([0, 0])
  })

  test('실행 중에 해금한 함수는 다시 실행해야 사용할 수 있다', () => {
    const g = Game.create(1)
    g.unlocked.add('loop')
    g.world.state.items.Daisy = 1000
    g.code = 'while True:\n    harvest()'
    g.run()
    g.buy('expand1')
    g.stop()
    g.code = 'move(Right)'
    expect(g.run()).toBe(true)
  })
})

describe('해금', () => {
  test('구입하면 자원이 줄고 효과가 적용된다', () => {
    const g = Game.create(1)
    g.world.state.items.Daisy = 100
    expect(g.canBuy('loop')).toBe(true)
    expect(g.buy('loop')).toBe(true)
    expect(g.world.state.items.Daisy).toBe(95)
    expect(g.unlocked.has('loop')).toBe(true)
    expect(g.buy('loop')).toBe(false)
    g.buy('expand1')
    expect([g.world.state.w, g.world.state.h]).toEqual([3, 1])
  })

  test('물주기를 해금하면 물탱크가 생기고, 수확량 강화는 배율을 2로 만든다', () => {
    const g = full()
    g.unlocked.delete('watering'); g.unlocked.delete('yieldDaisy')
    g.world.state.items.Strawberry = 1000; g.world.state.items.Daisy = 1000
    g.buy('watering'); g.buy('yieldDaisy')
    expect(g.world.state.waterCap).toBe(20)
    expect(g.world.state.yieldMult.Daisy).toBe(2)
  })

  test('완전 자동화를 구입하면 엔딩 시점을 기록하고, 그 뒤에도 계속 진행된다', () => {
    const g = full()
    g.world.state.items.Coin = 5000
    simulate(g, 1000)
    expect(g.finishedAtMs).toBeNull()
    g.buy('automation')
    expect(g.finishedAtMs).toBe(1000)
    simulate(g, 1000)
    expect(g.playMs).toBe(2000)
    expect(g.finishedAtMs).toBe(1000)
  })
})
