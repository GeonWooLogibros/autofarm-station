import { describe, expect, test } from 'vitest'
import { Game } from '../../src/progress/game'
import { World } from '../../src/sim/world'

const lastLine = (g: Game) => g.output[g.output.length - 1].text
const simulate = (g: Game, ms: number) => { for (let t = 0; t < ms; t += 50) g.tick(50) }
const baseState = () => structuredClone(World.create(1).state)

describe('과제용 게임', () => {
  test('주어진 해금으로 만든 게임이 수확한다', () => {
    const g = Game.forChallenge(baseState(), ['loop'], 'while True:\n    harvest()\n')
    expect(g.challenge).toBe(true)
    expect(g.code).toBe('while True:\n    harvest()\n')
    expect(g.run()).toBe(true)
    simulate(g, 3000)
    expect(g.world.state.items.Daisy).toBeGreaterThan(0)
  })

  test('해금하지 않은 문법은 과제용 문구로 막힌다', () => {
    const g = Game.forChallenge(baseState(), ['loop'], 'if True:\n    harvest()\n')
    expect(g.run()).toBe(false)
    expect(lastLine(g)).toContain('이 과제에서는 쓸 수 없는 문법입니다: ')
    expect(lastLine(g)).not.toContain('해금 화면')
  })

  test('해금하지 않은 함수는 과제용 문구로 막힌다', () => {
    const g = Game.forChallenge(baseState(), ['loop'], 'move(Right)\n')
    expect(g.run()).toBe(false)
    expect(lastLine(g)).toContain('이 과제에서는 쓸 수 없는 함수입니다: move')
    expect(lastLine(g)).not.toContain('해금 화면')
  })

  test('해금하지 않은 작물은 과제용 문구로 막힌다', () => {
    const g = Game.forChallenge(baseState(), ['strawberry'], 'plant(Tulip)\n')
    expect(g.run()).toBe(true)
    simulate(g, 2000)
    expect(g.status).toBe('error')
    expect(lastLine(g)).toContain('이 과제에서는 심을 수 없는 작물입니다: 튤립')
    expect(lastLine(g)).not.toContain('해금 화면')
  })

  test('speed2가 있으면 초당 800틱이다', () => {
    expect(Game.forChallenge(baseState(), ['speed2'], '').ticksPerSecond()).toBe(800)
  })

  test('본편 게임의 잠금 문구는 그대로다', () => {
    const g = Game.create(1)
    expect(g.challenge).toBe(false)
    g.code = 'if True:\n    harvest()\n'
    g.run()
    expect(lastLine(g)).toBe(`1번째 줄: 아직 해금하지 않은 문법입니다: if. 해금 화면에서 '조건문' 항목을 해금하면 사용할 수 있습니다.`)
    g.code = 'move(Right)\n'
    g.run()
    expect(lastLine(g)).toContain('아직 해금하지 않은 기능입니다: move. 해금 화면에서 ')
  })

  test('과제 게임에서 buy()는 항상 false이고 상태를 바꾸지 않는다', () => {
    const g = Game.forChallenge(baseState(), ['loop'], '')
    g.world.state.items.Daisy = 100000
    g.world.state.items.Tulip = 100000
    const before = JSON.stringify(g.world.state)
    expect(g.buy('tulip')).toBe(false)
    expect(g.unlocked.has('tulip')).toBe(false)
    expect(JSON.stringify(g.world.state)).toBe(before)
  })
})
