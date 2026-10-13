import { describe, expect, test } from 'vitest'
import { Game, MAX_OUTPUT_CHARS } from '../../src/progress/game'
import { UNLOCK_ORDER } from '../../src/progress/unlocks'

const simulate = (g: Game, ms: number, frame = 50) => { for (let t = 0; t < ms; t += frame) g.tick(frame) }
const full = () => {
  const g = Game.create(1)
  for (const id of UNLOCK_ORDER) if (id !== 'automation') g.unlocked.add(id)
  g.world.resize(6, 6)
  return g
}
const prints = (g: Game) => g.output.filter(o => o.kind === 'print').map(o => o.text)

describe('실행 제어 보충', () => {
  test('실행 중에 다시 실행하면 현재 코드로 처음부터 시작한다', () => {
    const g = full()
    g.code = 'print(1)\nwhile True:\n    harvest()'
    g.run(); simulate(g, 500)
    g.code = 'print(2)'
    expect(g.run()).toBe(true)
    expect(g.currentLine).toBe(0)
    simulate(g, 500)
    expect(prints(g)).toEqual(['1', '2'])
    expect(g.status).toBe('idle')
  })

  test('쉬는 중에 정지해도 문제없다', () => {
    const g = Game.create(1)
    g.stop()
    expect(g.status).toBe('idle')
    expect(g.paused).toBe(false)
    expect(g.currentLine).toBe(0)
  })

  test('구문 오류가 있는 코드의 한 단계 실행은 오류로 남고 멈추지 않는다', () => {
    const g = full()
    g.code = 'while True\n    harvest()'
    g.stepOnce()
    expect(g.status).toBe('error')
    expect(g.paused).toBe(false)
    expect(g.errorLine).toBe(1)
  })

  test('마지막 문장을 한 단계 실행하면 쉬는 상태가 된다', () => {
    const g = full()
    g.code = 'print(1)'
    g.stepOnce()
    expect(prints(g)).toEqual(['1'])
    expect(g.status).toBe('idle')
    expect(g.paused).toBe(false)
    expect(g.currentLine).toBe(0)
  })

  test('이전 실행의 출력은 다시 실행해도 남는다', () => {
    const g = full()
    g.code = 'print(1)'
    g.run(); simulate(g, 200)
    g.run(); simulate(g, 200)
    expect(prints(g)).toEqual(['1', '1'])
  })

  test('실행 중 오류의 출력 형식은 줄 번호와 메시지이다', () => {
    const g = full()
    g.code = 'harvest()\nx = 1 / 0'
    g.run(); simulate(g, 2000)
    expect(g.output.at(-1)!.kind).toBe('error')
    expect(g.output.at(-1)!.text.startsWith('2번째 줄: ')).toBe(true)
  })

  test('살 수 없는 항목을 구입해도 아무것도 바뀌지 않는다', () => {
    const g = Game.create(1)
    g.world.state.items.Daisy = 4
    expect(g.canBuy('loop')).toBe(false)
    expect(g.buy('loop')).toBe(false)
    expect(g.world.state.items.Daisy).toBe(4)
    expect(g.unlocked.has('loop')).toBe(false)
    expect(g.buy('cond')).toBe(false)
  })

  test('전력이 0이 되면 초당 틱 두 배가 끝난다', () => {
    const g = Game.create(1)
    g.world.state.items.Power = 0.5
    expect(g.ticksPerSecond()).toBe(800)
    g.world.state.items.Power = 0
    expect(g.ticksPerSecond()).toBe(400)
  })

  test('어떤 경과 시간에도 tick은 예외를 던지지 않는다', () => {
    const g = Game.create(1)
    for (const dt of [Infinity, -Infinity, NaN, 0, -1, 1e-320, Number.MAX_VALUE, 49.999, 50, 250.0001]) {
      expect(() => g.tick(dt)).not.toThrow()
    }
    expect(Number.isFinite(g.playMs)).toBe(true)
  })

  test('처음 상태의 설정과 코드', () => {
    const g = Game.create(1)
    expect(g.settings).toEqual({ guide: true, sound: true })
    expect(g.code).toBe('harvest()\n')
    expect(g.finishedAtMs).toBeNull()
    expect(g.errorLine).toBe(0)
  })

  test('실행 중에 작물을 해금하면 다시 실행하지 않아도 그 작물을 심을 수 있다', () => {
    const g = Game.create(1)
    for (const id of ['loop', 'expand1', 'cond', 'strawberry', 'var'] as const) g.unlocked.add(id)
    g.world.resize(3, 1)
    g.world.state.items.Strawberry = 1000
    g.world.state.items.Daisy = 1000
    g.code = 'move(Right)\nmove(Right)\nmove(Right)\nprint(plant(Tulip))'
    expect(g.run()).toBe(true)
    simulate(g, 500)
    expect(g.buy('tulip')).toBe(true)
    simulate(g, 3000)
    expect(g.status, g.output.at(-1)?.text).toBe('idle')
    expect(prints(g)).toEqual(['True'])
    expect(g.world.cellAt(0, 0).plant).toBe('Tulip')
  })

  test('해금하지 않은 작물은 여전히 심을 수 없다', () => {
    const g = Game.create(1)
    for (const id of ['loop', 'expand1', 'cond', 'strawberry'] as const) g.unlocked.add(id)
    g.code = 'plant(Tulip)'
    g.run(); simulate(g, 500)
    expect(g.status).toBe('error')
    expect(g.output.at(-1)!.text).toContain('튤립')
  })

  test('출력 한 줄은 2000자까지만 남기고 뒤를 줄임표로 바꾼다', () => {
    expect(MAX_OUTPUT_CHARS).toBe(2000)
    const g = full()
    g.code = 's = "ab"\nfor i in range(11):\n    s = s + s\nprint(s)\nprint("짧은 줄")'
    g.run(); simulate(g, 1000)
    const out = prints(g)
    expect(out).toHaveLength(2)
    expect(out[0]).toHaveLength(MAX_OUTPUT_CHARS + 1)
    expect(out[0].endsWith('ab…')).toBe(true)
    expect(out[1]).toBe('짧은 줄')
  })

  test('딱 2000자인 줄은 그대로 남긴다', () => {
    const g = full()
    g.code = 's = "0123456789"\nt = ""\nfor i in range(200):\n    t = t + s\nprint(t)'
    g.run(); simulate(g, 2000)
    expect(prints(g)[0]).toHaveLength(2000)
  })

  test('드론 함수에서 예상하지 못한 오류가 나면 한국어 안내를 출력하고 원인을 errorCause에 남긴다', () => {
    const g = full()
    const bug = new TypeError('Cannot read properties of undefined')
    g.world.harvest = () => { throw bug }
    g.code = 'harvest()'
    g.run(); simulate(g, 500)
    expect(g.status).toBe('error')
    expect(g.output.at(-1)!.text).toBe('1번째 줄: 실행 중에 예상하지 못한 문제가 발생했습니다. 코드를 조금 바꿔서 다시 실행해 주세요.')
    expect(g.errorCause).toBe(bug)
    g.code = 'print(1)'
    g.run()
    expect(g.errorCause).toBeUndefined()
  })

  test('플레이어의 실수로 난 오류에는 errorCause가 없다', () => {
    const g = full()
    g.code = 'move(3)'
    g.run(); simulate(g, 500)
    expect(g.status).toBe('error')
    expect(g.output.at(-1)!.text).toContain('방향')
    expect(g.errorCause).toBeUndefined()
  })

  test('멈춘 동안 코드를 고치고 실행하면 고친 코드로 처음부터 실행한다', () => {
    const g = full()
    g.code = 'print(1)\nprint(2)\nprint(3)'
    g.stepOnce()
    expect(g.canResume).toBe(true)
    g.code = 'print(9)\nprint(8)'
    expect(g.canResume).toBe(false)
    expect(g.run()).toBe(true)
    expect(g.paused).toBe(false)
    expect(g.currentLine).toBe(0)
    simulate(g, 500)
    expect(prints(g)).toEqual(['1', '9', '8'])
    expect(g.status).toBe('idle')
  })

  test('멈춘 동안 코드를 고치고 한 단계 실행하면 고친 코드의 첫 문장을 실행하고 멈춘다', () => {
    const g = full()
    g.code = 'print(1)\nprint(2)\nprint(3)'
    g.stepOnce()
    g.code = 'print(9)\nprint(8)'
    simulate(g, 100)
    g.stepOnce()
    expect(prints(g)).toEqual(['1', '9'])
    expect(g.paused).toBe(true)
    expect(g.currentLine).toBe(2)
    expect(g.canResume).toBe(true)
  })

  test('멈춘 동안 고친 코드에 구문 오류가 있으면 실행하지 않고 오류로 남는다', () => {
    const g = full()
    g.code = 'print(1)\nprint(2)'
    g.stepOnce()
    g.code = 'while True\n    print(9)'
    expect(g.run()).toBe(false)
    expect(g.status).toBe('error')
    expect(g.paused).toBe(false)
    expect(g.errorLine).toBe(1)
    simulate(g, 500)
    expect(prints(g)).toEqual(['1'])
  })

  test('멈춘 동안 코드를 고쳤다가 원래대로 되돌리면 이어서 실행한다', () => {
    const g = full()
    g.code = 'print(1)\nprint(2)'
    g.stepOnce()
    g.code = 'print(9)'
    g.code = 'print(1)\nprint(2)'
    expect(g.canResume).toBe(true)
    g.run(); simulate(g, 500)
    expect(prints(g)).toEqual(['1', '2'])
  })

  test('멈추지 않았으면 canResume은 거짓이다', () => {
    const g = full()
    expect(g.canResume).toBe(false)
    g.code = 'while True:\n    harvest()'
    g.run()
    expect(g.canResume).toBe(false)
  })
})
