import { describe, expect, test } from 'vitest'
import { Game } from '../../src/progress/game'
import { deserialize, serialize } from '../../src/progress/save'
import { UNLOCK_ORDER } from '../../src/progress/unlocks'

const FRAME = 1000 / 30
const SECONDS = 30
const full = () => {
  const g = Game.create(1)
  for (const id of UNLOCK_ORDER) if (id !== 'automation' && id !== 'speed1' && id !== 'speed2') g.unlocked.add(id)
  g.world.resize(6, 6)
  return g
}
// 1초에 30번씩 30초 동안 each를 부르면서 시간을 진행하고, 그동안 일어난 이벤트의 수를 센다.
function count(g: Game, type: string, each: (g: Game) => void): number {
  let n = 0
  for (let i = 0; i < SECONDS * 30; i++) {
    each(g)
    g.tick(FRAME)
    n += g.world.takeEvents().filter(e => e.type === type).length
  }
  return n
}
const prints = (g: Game) => g.output.filter(o => o.kind === 'print').map(o => o.text)

describe('동작 시간은 드론의 것이다', () => {
  test('한 단계 실행을 1초에 30번씩 눌러도 그냥 실행한 것보다 많이 움직이지 않는다', () => {
    const normal = full()
    normal.code = 'while True:\n    move(Right)'
    normal.run()
    const expected = count(normal, 'move', () => {})
    expect(expected).toBeGreaterThanOrEqual(58)
    expect(expected).toBeLessThanOrEqual(60)

    const stepped = full()
    stepped.code = normal.code
    const moves = count(stepped, 'move', g => g.stepOnce())
    expect(moves).toBeLessThanOrEqual(expected + 1)
    expect(moves).toBeGreaterThanOrEqual(expected - 5) // 누르고 있으면 거의 같은 속도로 진행한다
  })

  test('실행하기를 1초에 30번씩 눌러도 동작은 시간이 허락하는 만큼만 한다', () => {
    const g = full()
    g.code = 'move(Right)'
    const moves = count(g, 'move', x => x.run())
    expect(moves).toBeLessThanOrEqual(61) // 30초 × 400틱 ÷ 200틱 = 60
    expect(moves).toBeGreaterThanOrEqual(55)
  })

  test('정지하기와 실행하기를 번갈아 눌러도 동작 시간을 건너뛰지 못한다', () => {
    const g = full()
    g.code = 'while True:\n    move(Right)'
    const moves = count(g, 'move', x => { x.stop(); x.run() })
    expect(moves).toBeLessThanOrEqual(61)
  })

  test('오류로 끝난 프로그램의 동작 시간도 다음 실행이 기다린다', () => {
    const g = full()
    g.code = 'move(Right)\nx = 1 / 0'
    const moves = count(g, 'move', x => x.run())
    expect(moves).toBeLessThanOrEqual(61)
  })

  test('드론이 동작을 끝내기 전의 한 단계 실행은 문장을 실행하지 않고, 쌓이지도 않는다', () => {
    const g = full()
    g.code = 'move(Right)\nprint(1)\nprint(2)\nprint(3)'
    g.stepOnce()
    expect(g.world.state.droneX).toBe(1)
    expect(g.busy).toBe(true)
    for (let i = 0; i < 10; i++) g.stepOnce()
    expect(prints(g)).toEqual([])
    expect(g.paused).toBe(true)
    for (let t = 0; t < 600; t += 50) g.tick(50) // 동작 시간 0.5초가 지난다
    expect(g.busy).toBe(false)
    expect(prints(g)).toEqual([]) // 기다리는 동안 누른 것은 나중에 실행되지 않는다
    g.stepOnce()
    expect(prints(g)).toEqual(['1'])
  })

  test('실행 중에 한 단계 실행을 누르면 드론이 바쁘더라도 곧바로 멈춘다', () => {
    const g = full()
    g.code = 'while True:\n    move(Right)'
    g.run()
    g.tick(50)
    expect(g.busy).toBe(true)
    const x = g.world.state.droneX
    g.stepOnce()
    expect(g.paused).toBe(true)
    expect(g.status).toBe('running')
    expect(g.world.state.droneX).toBe(x)
    for (let t = 0; t < 3000; t += 50) g.tick(50)
    expect(g.world.state.droneX).toBe(x)
    expect(g.busy).toBe(false)
  })

  test('한 단계 실행한 뒤에 실행하기를 누르면 남은 동작 시간을 채운 다음 이어서 실행한다', () => {
    const g = full()
    g.code = 'move(Right)\nmove(Right)\nmove(Right)'
    g.stepOnce()
    g.run()
    expect(g.world.state.droneX).toBe(1)
    for (let t = 0; t < 400; t += 50) g.tick(50)
    expect(g.world.state.droneX).toBe(1) // 첫 동작 시간 0.5초가 아직 지나지 않았다
    for (let t = 0; t < 200; t += 50) g.tick(50)
    expect(g.world.state.droneX).toBe(2)
    for (let t = 0; t < 1500; t += 50) g.tick(50)
    expect(g.world.state.droneX).toBe(3)
    expect(g.status).toBe('idle')
  })

  test('쉬는 중에도 남은 동작 시간은 줄어들고, 새로 실행한 프로그램은 그 시간이 지난 뒤에 시작한다', () => {
    const g = full()
    g.code = 'move(Right)'
    g.run()
    g.tick(50)
    g.stop()
    expect(g.status).toBe('idle')
    expect(g.busy).toBe(true)
    g.tick(50)
    expect(g.busy).toBe(true)
    g.code = 'print(1)'
    expect(g.run()).toBe(true)
    g.tick(50)
    expect(prints(g)).toEqual([])
    for (let t = 0; t < 400; t += 50) g.tick(50)
    expect(prints(g)).toEqual(['1'])
  })

  test('남은 동작 시간은 저장하지 않는다', () => {
    const g = full()
    g.code = 'move(Right)'
    g.run()
    g.tick(50)
    expect(g.busy).toBe(true)
    const r = deserialize(serialize(g))!
    expect(r.busy).toBe(false)
    expect(serialize(g)).not.toContain('busy')
  })
})
