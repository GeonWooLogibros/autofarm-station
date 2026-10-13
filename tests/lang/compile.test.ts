import { describe, expect, test } from 'vitest'
import { compile, type CompileOptions } from '../../src/lang'
import { ALL_FEATURES, type Feature } from '../../src/lang/checker'
import { host } from '../../src/lang/values'

const TITLES: Record<Feature, string> = {
  loop: '반복', cond: '조건문', var: '변수', func: '함수', for: 'for 반복', list: '리스트', dict: '딕셔너리',
}
const opts = (features: Feature[], locked: [string, string][] = []): CompileOptions => ({
  features: new Set(features),
  featureTitles: TITLES,
  globals: new Map([['harvest', host('harvest', 200, 0, 0, () => true)]]),
  lockedNames: new Map(locked),
})
const lockedMessage = (src: string, features: Feature[], locked: [string, string][] = []) => {
  const r = compile(src, opts(features, locked))
  if (r.ok) throw new Error('잠금 오류가 발생하지 않았습니다')
  expect(r.error.kind).toBe('locked')
  return r.error
}

describe('compile', () => {
  test('아무것도 해금하지 않아도 함수 호출은 실행할 수 있다', () => {
    const r = compile('harvest()\nharvest()', opts([]))
    expect(r.ok).toBe(true)
  })

  test('잠긴 문법은 필요한 해금 항목의 이름과 줄 번호를 알려 준다', () => {
    const e = lockedMessage('harvest()\nwhile True:\n    harvest()', [])
    expect(e.line).toBe(2)
    expect(e.message).toContain('while')
    expect(e.message).toContain("'반복'")
  })

  test.each([
    ['if True:\n    harvest()', ['loop'], '조건문'],
    ['while 1 < 2:\n    harvest()', ['loop'], '조건문'],
    ['x = 1', ['loop', 'cond'], '변수'],
    ['while True:\n    harvest()\n    break', [], '반복'],
    ['def f():\n    harvest()', ['loop', 'cond', 'var'], '함수'],
    ['for i in [1]:\n    harvest()', ['loop', 'cond', 'var', 'func', 'list'], 'for 반복'],
    ['x = [1, 2]', ['loop', 'cond', 'var', 'func', 'for'], '리스트'],
    ['x = {}', ['loop', 'cond', 'var', 'func', 'for', 'list'], '딕셔너리'],
  ] as [string, Feature[], string][])('%s → %s 필요', (src, features, title) => {
    expect(lockedMessage(src, features).message).toContain(`'${title}'`)
  })

  test('모두 해금하면 모든 문법을 실행할 수 있다', () => {
    const src = 'd = {}\ndef f(a):\n    for i in [1, 2]:\n        if a > i:\n            d[i] = a\n    return d\nf(3)'
    expect(compile(src, opts(ALL_FEATURES)).ok).toBe(true)
  })

  test('잠긴 함수 이름을 쓰면 해금 항목을 알려 준다', () => {
    const e = lockedMessage('water()', ALL_FEATURES, [['water', '물주기']])
    expect(e.message).toContain('water')
    expect(e.message).toContain("'물주기'")
  })

  test('잠긴 이름과 같은 변수를 직접 만들면 잠금 오류가 아니다', () => {
    const r = compile('water = 3', opts(ALL_FEATURES, [['water', '물주기']]))
    expect(r.ok).toBe(true)
  })

  test('구문 오류는 ok: false로 돌려준다', () => {
    const r = compile('while True\n    harvest()', opts(ALL_FEATURES))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('syntax')
  })

  test('빈 소스는 곧바로 끝나는 프로그램이다', () => {
    const r = compile('', opts([]))
    expect(r.ok && r.program.step(10).status).toBe('done')
  })
})
