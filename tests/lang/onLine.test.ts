import { describe, expect, test } from 'vitest'
import { builtins } from '../../src/lang/builtins'
import { Program } from '../../src/lang/interpreter'
import { parseSource } from '../../src/lang/parser'

const lines = (source: string, ticks: number, onStart?: (p: Program) => void): number[] => {
  const seen: number[] = []
  const program = new Program(parseSource(source), builtins())
  program.onLine = line => seen.push(line)
  onStart?.(program)
  program.step(ticks)
  return seen
}

describe('Program.onLine', () => {
  test('문장이 시작될 때마다 그 줄 번호를 순서대로 알린다', () => {
    expect(lines('x = 1\ny = 2\nz = 3\n', 100)).toEqual([1, 2, 3])
  })

  test('조건문과 본문의 줄도 알린다', () => {
    expect(lines('if True:\n    x = 1\nif False:\n    x = 2\n', 100)).toEqual([1, 2, 3])
  })

  test('반복문은 조건을 다시 확인할 때마다 자기 줄을 알린다', () => {
    expect(lines('for i in range(2):\n    x = i\n', 100)).toEqual([1, 1, 2, 1, 2]) // 첫 문장 시작과 첫 반복의 조건 확인이 모두 알려진다
    expect(lines('n = 0\nwhile n < 2:\n    n += 1\n', 100)).toEqual([1, 2, 2, 3, 2, 3, 2])
  })

  test('함수 안의 줄도 알리고, 같은 줄이 이어서 시작되면 그대로 두 번 알린다', () => {
    expect(lines('def f():\n    return 1\nx = f() + f()\n', 100)).toEqual([1, 3, 2, 2])
  })

  test('예산이 모자라 아직 시작하지 못한 문장은 알리지 않는다', () => {
    expect(lines('x = 1\ny = 2\nz = 3\n', 1)).toEqual([1])
  })

  test('onLine이 없어도 실행된다', () => {
    const program = new Program(parseSource('x = 1\n'), builtins())
    expect(program.step(10).status).toBe('done')
  })
})
