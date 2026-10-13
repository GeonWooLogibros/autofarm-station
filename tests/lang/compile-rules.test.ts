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
const fail = (src: string, features: Feature[], locked: [string, string][] = []) => {
  const r = compile(src, opts(features, locked))
  if (r.ok) throw new Error('오류가 발생하지 않았습니다')
  return r.error
}
const WATER: [string, string][] = [['water', '물주기']]

describe('잠긴 이름 가리기', () => {
  test('for 변수로 만든 이름은 잠긴 이름이 아니다', () => {
    expect(compile('for water in [1]:\n    harvest()', opts(ALL_FEATURES, WATER)).ok).toBe(true)
  })
  test('함수 매개변수로 만든 이름은 잠긴 이름이 아니다', () => {
    expect(compile('def f(water):\n    return water\nf(1)', opts(ALL_FEATURES, WATER)).ok).toBe(true)
  })
  test('def 이름으로 만든 이름은 잠긴 이름이 아니다', () => {
    expect(compile('def water():\n    harvest()\nwater()', opts(ALL_FEATURES, WATER)).ok).toBe(true)
  })
  test('함수 본문 안에서만 쓴 잠긴 이름도 찾아낸다', () => {
    const e = fail('def f():\n    water()', ALL_FEATURES, WATER)
    expect(e.kind).toBe('locked')
    expect(e.line).toBe(2)
    expect(e.message).toContain("'물주기'")
  })
  test('인덱스 대입은 이름을 만든 것이 아니다', () => {
    const e = fail('water[0] = 1', ALL_FEATURES, WATER)
    expect(e.message).toContain('water')
  })
})

describe('규칙별 필요 문법', () => {
  test('중첩된 잠긴 문법은 안쪽 줄 번호를 알려 준다', () => {
    const e = fail('while True:\n    harvest()\n    if True:\n        harvest()', ['loop'])
    expect(e.line).toBe(3)
    expect(e.message).toContain("'조건문'")
  })
  test('안쪽 식의 줄 번호를 알려 준다', () => {
    const e = fail('harvest()\nharvest(\n  1 + 2)', [])
    expect(e.message).toContain("'변수'")
    expect(e.line).toBeGreaterThanOrEqual(2)
  })
  test('문장 자체의 문법을 하위 식보다 먼저 보고한다', () => {
    const e = fail('while 1 < 2:\n    harvest()', [])
    expect(e.message).toContain("'반복'")
  })
  test('not은 cond가 필요하다', () => {
    const e = fail('harvest(not True)', [])
    expect(e.message).toContain('not')
    expect(e.message).toContain("'조건문'")
  })
  test('None은 cond가 필요하다', () => {
    const e = fail('harvest(None)', [])
    expect(e.message).toContain('None')
    expect(e.message).toContain("'조건문'")
  })
  test('True와 False는 항상 허용한다', () => {
    expect(compile('harvest(True)\nharvest(False)', opts([])).ok).toBe(true)
  })
  test('단항 마이너스는 var가 필요하다', () => {
    const e = fail('harvest(-1)', [])
    expect(e.message).toContain("'변수'")
  })
  test('and/or는 cond가 필요하다', () => {
    const e = fail('harvest(True and False)', ['var'])
    expect(e.message).toContain('and/or')
    expect(e.message).toContain("'조건문'")
  })
  test('메서드 호출 a.append(1)은 list가 필요하다', () => {
    const e = fail('a.append(1)', ['loop', 'cond', 'var', 'func', 'for', 'dict'])
    expect(e.message).toContain("'리스트'")
  })
  test('튜플과 인덱스는 list가 필요하다', () => {
    expect(fail('harvest((1, 2))', ['var']).message).toContain("'리스트'")
    expect(fail('harvest(a[0])', ['var']).message).toContain("'리스트'")
  })
  test('return과 global은 func가 필요하다', () => {
    expect(fail('return', []).message).toContain("'함수'")
    expect(fail('global x', []).message).toContain("'함수'")
  })
  test('복합 대입은 var가 필요하다', () => {
    expect(fail('x += 1', []).message).toContain("'변수'")
  })
})

describe('깊은 구문 트리', () => {
  test('스택을 넘기는 식은 RangeError 대신 구문 오류로 돌려준다', () => {
    // 90겹 괄호가 각각 90항 덧셈 사슬의 첫 항이 되는 모양 (트리 깊이 약 8100)
    const tail = ' + 1'.repeat(89)
    let src = '1'
    for (let i = 0; i < 90; i++) src = `(${src})${tail}`
    const r = compile(`x = ${src}`, opts(ALL_FEATURES))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('syntax')
      expect(r.error.message).toBe('식이 너무 복잡합니다. 여러 줄로 나누어 써 주세요.')
    }
  })
})
