import { describe, expect, test } from 'vitest'
import { Game } from '../../src/progress/game'

const PROGRAM = 'while True:\n    if can_harvest():\n        harvest()\n    move(Right)\n'

const shelf = () => {
  const g = Game.create(1)
  for (const id of ['loop', 'expand1', 'cond'] as const) g.unlocked.add(id)
  g.world.resize(3, 1)
  g.code = PROGRAM
  return g
}

describe('실행 줄 강조와 즉시 실행되는 줄', () => {
  test('프레임이 끝났을 때의 currentLine은 거의 항상 동작 줄이고, 프로그램은 올바르게 동작한다', () => {
    const g = shelf()
    expect(g.run()).toBe(true)
    const seen = new Map<number, number>()
    let harvests = 0
    let fails = 0
    let moves = 0
    let frames = 0
    for (let t = 0; t < 8000; t += 16) {
      g.tick(16)
      frames++
      seen.set(g.currentLine, (seen.get(g.currentLine) ?? 0) + 1)
      for (const e of g.world.takeEvents()) {
        if (e.type === 'harvest') harvests++
        if (e.type === 'fail') fails++
        if (e.type === 'move') moves++
      }
    }
    expect(g.status).toBe('running')
    const at = (n: number) => seen.get(n) ?? 0
    console.log('frames', frames, 'line counts', Object.fromEntries(seen), 'harvest', harvests, 'fail', fails, 'move', moves)
    expect(fails).toBe(0)
    expect(harvests).toBeGreaterThan(0)
    expect(harvests).toBeLessThan(moves) // can_harvest()가 거짓인 순회에서는 수확을 건너뛴다
    expect(at(1) + at(2)).toBeLessThan(frames * 0.05)
    expect(at(3) + at(4)).toBeGreaterThan(frames * 0.9)
  })
})

describe('Game.recentLines', () => {
  test('실행 중이 아니면 비어 있다', () => {
    const g = shelf()
    expect(g.recentLines).toEqual([])
    g.tick(16)
    expect(g.recentLines).toEqual([])
  })

  test('움직임을 끝내고 수확을 시작하는 프레임은 [1, 2, 3]을 순서대로 알린다', () => {
    const g = shelf()
    g.run()
    let prevEnd = 0
    let found = 0
    for (let t = 0; t < 8000; t += 16) {
      g.tick(16)
      const r = g.recentLines
      if (prevEnd === 4 && r.length > 0) {
        expect(r[0]).toBe(1)
        expect(r[1]).toBe(2)
        if (r[2] !== undefined) expect([3, 4]).toContain(r[2]) // can_harvest()가 거짓이면 수확을 건너뛴다
        if (r[2] === 3 && g.currentLine === 3) { expect(r).toEqual([1, 2, 3]); found++ }
      }
      prevEnd = g.currentLine
    }
    expect(found).toBeGreaterThan(0)
  })

  test('tick을 시작할 때마다 비워진다', () => {
    const g = shelf()
    g.run()
    g.tick(16)
    expect(g.recentLines.length).toBeGreaterThan(0)
    let sawEmpty = false
    for (let i = 0; i < 100; i++) {
      g.tick(16)
      if (g.recentLines.length === 0) sawEmpty = true // 동작 시간만 치른 프레임
    }
    expect(sawEmpty).toBe(true)
  })

  test('같은 줄이 이어서 시작되면 한 번만 남긴다', () => {
    const g = Game.create(1)
    for (const id of ['loop', 'var', 'func'] as const) g.unlocked.add(id)
    g.code = 'def f():\n    return 1\nwhile True:\n    print(f() + f())\n'
    g.run()
    g.tick(16)
    expect(g.recentLines.slice(0, 4)).toEqual([1, 3, 4, 2]) // f()를 두 번 불러도 return 줄은 한 번
  })

  test('최근 32줄까지만 남긴다', () => {
    const g = Game.create(1)
    g.unlocked.add('loop')
    g.code = 'while True:\n    pass\n'
    g.run()
    g.tick(250)
    expect(g.recentLines).toHaveLength(32)
    expect(new Set(g.recentLines)).toEqual(new Set([1, 2]))
  })

  test('멈추거나 오류가 나면 비워진다', () => {
    const g = shelf()
    g.run()
    g.tick(16)
    g.stop()
    expect(g.recentLines).toEqual([])
    g.code = 'x = 1\nprint(y)\n'
    g.run()
    g.tick(16)
    expect(g.status).toBe('error')
    expect(g.recentLines).toEqual([])
  })

  test('stepOnce에서도 시작한 줄을 알린다', () => {
    const g = shelf()
    g.stepOnce()
    expect(g.recentLines).toEqual([1, 2]) // 1번째 줄을 실행하고, 다음으로 실행할 2번째 줄에서 멈춘다
    expect(g.currentLine).toBe(2)
  })
})
