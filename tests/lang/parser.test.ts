import { describe, expect, test } from 'vitest'
import { parseSource } from '../../src/lang/parser'
import { LangError } from '../../src/lang/errors'
import { parse } from '../../src/lang/parser'
import type { Token } from '../../src/lang/lexer'

const fail = (src: string): LangError => {
  try { parseSource(src) } catch (e) { return e as LangError }
  throw new Error('오류가 발생하지 않았습니다')
}

describe('parse', () => {
  test('함수 호출 문장', () => {
    expect(parseSource('move(Right)')).toMatchObject([
      { t: 'Expr', line: 1, e: { t: 'Call', fn: { t: 'Name', id: 'move' }, args: [{ t: 'Name', id: 'Right' }] } },
    ])
  })

  test('while과 블록', () => {
    const [s] = parseSource('while True:\n    harvest()\n    move(Right)')
    expect(s).toMatchObject({ t: 'While', cond: { t: 'Const', v: true } })
    expect((s as any).body.length).toBe(2)
  })

  test('if / elif / else', () => {
    const [s] = parseSource('if a:\n    x()\nelif b:\n    y()\nelse:\n    z()')
    expect(s).toMatchObject({ t: 'If' })
    expect((s as any).branches.length).toBe(2)
    expect((s as any).orelse.length).toBe(1)
  })

  test('연산자 우선순위', () => {
    const [s] = parseSource('x = 1 + 2 * 3 ** 2')
    expect(s).toMatchObject({
      t: 'Assign',
      value: { t: 'Bin', op: '+', r: { t: 'Bin', op: '*', r: { t: 'Bin', op: '**' } } },
    })
  })

  test('단항 음수와 not', () => {
    expect(parseSource('x = -a')[0]).toMatchObject({ value: { t: 'Unary', op: '-' } })
    expect(parseSource('x = not a == b')[0]).toMatchObject({ value: { t: 'Unary', op: 'not', e: { t: 'Cmp' } } })
  })

  test('연속 비교와 in, not in, is, is not', () => {
    expect(parseSource('x = 0 <= a < 5')[0]).toMatchObject({ value: { t: 'Cmp', rest: [{ op: '<=' }, { op: '<' }] } })
    expect(parseSource('x = a not in b')[0]).toMatchObject({ value: { t: 'Cmp', rest: [{ op: 'not in' }] } })
    expect(parseSource('x = a is None')[0]).toMatchObject({ value: { t: 'Cmp', rest: [{ op: '==' }] } })
    expect(parseSource('x = a is not None')[0]).toMatchObject({ value: { t: 'Cmp', rest: [{ op: '!=' }] } })
  })

  test('and는 or보다 먼저 묶인다', () => {
    expect(parseSource('x = a or b and c')[0]).toMatchObject({ value: { t: 'Bool', op: 'or', r: { t: 'Bool', op: 'and' } } })
  })

  test('복합 대입과 인덱스 대입', () => {
    expect(parseSource('x += 1')[0]).toMatchObject({ t: 'Aug', op: '+' })
    expect(parseSource('a[0] = 1')[0]).toMatchObject({ t: 'Assign', target: { t: 'Index' } })
  })

  test('리스트, 튜플, 딕셔너리, 메서드 호출', () => {
    expect(parseSource('x = [1, 2]')[0]).toMatchObject({ value: { t: 'List' } })
    expect(parseSource('x = (1, 2)')[0]).toMatchObject({ value: { t: 'Tuple' } })
    expect(parseSource('x = (1)')[0]).toMatchObject({ value: { t: 'Num' } })
    expect(parseSource('x = {1: 2, "a": 3}')[0]).toMatchObject({ value: { t: 'Dict' } })
    expect(parseSource('a.append(1)')[0]).toMatchObject({ e: { t: 'Call', fn: { t: 'Attr', name: 'append' } } })
  })

  test('def, return, global, for', () => {
    const [d] = parseSource('def f(a, b):\n    global n\n    return a + b')
    expect(d).toMatchObject({ t: 'Def', name: 'f', params: ['a', 'b'] })
    expect(parseSource('for i in range(3):\n    pass')[0]).toMatchObject({ t: 'For', name: 'i' })
  })

  test('문장마다 줄 번호를 기록한다', () => {
    const body = parseSource('a()\n\nwhile True:\n    b()')
    expect(body[1].line).toBe(3)
    expect((body[1] as any).body[0].line).toBe(4)
  })

  test('콜론이 빠지면 안내한다', () => {
    const e = fail('while True\n    harvest()')
    expect(e.kind).toBe('syntax')
    expect(e.line).toBe(1)
    expect(e.message).toContain(':')
  })

  test('블록이 비어 있으면 안내한다', () => {
    expect(fail('while True:\nharvest()').message).toContain('들여')
  })

  test('괄호가 닫히지 않으면 안내한다', () => {
    expect(fail('move(Right').message).toContain(')')
  })

  test('지원하지 않는 문법을 안내한다', () => {
    expect(fail('import os').message).toContain('지원하지 않는')
    expect(fail('a, b = 1, 2').message).toContain('지원하지 않는')
  })

  test('대입할 수 없는 대상', () => {
    expect(fail('f() = 3').message).toContain('대입')
  })
})

describe('parse — 잘못된 입력에도 LangError만 낸다', () => {
  test('첫 줄이 들여쓰여 있으면 안내한다', () => {
    const e = fail('    harvest()')
    expect(e).toBeInstanceOf(LangError)
    expect(e.kind).toBe('syntax')
    expect(e.line).toBe(1)
    expect(e.message).toContain('들여')
  })

  test('if 없는 else', () => {
    const e = fail('a()\nelse:\n    b()')
    expect(e.kind).toBe('syntax')
    expect(e.line).toBe(2)
  })

  test('if 없는 elif', () => {
    const e = fail('elif a:\n    b()')
    expect(e.kind).toBe('syntax')
    expect(e.line).toBe(1)
  })

  test('def에 이름이 없다', () => {
    const e = fail('def (a):\n    pass')
    expect(e.kind).toBe('syntax')
    expect(e.line).toBe(1)
    expect(e.message).toContain('이름')
  })

  test('식 문장 뒤에 군더더기', () => {
    const e = fail('harvest() harvest()')
    expect(e.kind).toBe('syntax')
    expect(e.line).toBe(1)
  })

  test('콜론만 있는 줄', () => {
    const e = fail('a()\n:')
    expect(e.kind).toBe('syntax')
    expect(e.line).toBe(2)
  })

  test('손으로 만든 토큰: 닫는 괄호 없음', () => {
    const tokens: Token[] = [
      { type: 'name', value: 'move', line: 1 },
      { type: 'op', value: '(', line: 1 },
      { type: 'name', value: 'Right', line: 1 },
      { type: 'newline', value: '', line: 1 },
      { type: 'eof', value: '', line: 1 },
    ]
    expect(() => parse(tokens)).toThrow(LangError)
    try { parse(tokens) } catch (e) { expect((e as LangError).message).toContain("')'") }
  })

  test('손으로 만든 토큰: eof가 없거나 비어 있어도 안전하다', () => {
    expect(() => parse([{ type: 'op', value: '(', line: 1 }])).toThrow(LangError)
    expect(parse([])).toEqual([])
  })

  test('너무 깊게 겹친 괄호도 LangError', () => {
    expect(fail('x = ' + '('.repeat(5000) + '1' + ')'.repeat(5000)).kind).toBe('syntax')
    expect(fail('x = ' + '- '.repeat(5000) + '1').kind).toBe('syntax')
  })

  test('** 연쇄가 길어도 LangError', () => {
    expect(fail('x = ' + '2**'.repeat(5000) + '2').kind).toBe('syntax')
  })

  test('같은 연산자가 너무 길게 이어지면 LangError', () => {
    expect(fail('x = ' + '1 + '.repeat(5000) + '1').kind).toBe('syntax')
    expect(fail('x = ' + 'a or '.repeat(5000) + 'a').kind).toBe('syntax')
    expect(fail('x = ' + 'a and '.repeat(5000) + 'a').kind).toBe('syntax')
    expect(fail('x = ' + '1 * '.repeat(5000) + '1').kind).toBe('syntax')
    expect(fail('x = ' + 'a < '.repeat(5000) + 'a').kind).toBe('syntax')
  })

  test('50항 덧셈 연쇄는 통과한다', () => {
    expect(parseSource('x = ' + '1 + '.repeat(49) + '1')[0]).toMatchObject({ t: 'Assign' })
  })

  test('콜론 하나만 있는 소스', () => {
    expect(fail(':').kind).toBe('syntax')
  })

  test('그 밖의 어긋난 입력은 모두 LangError', () => {
    const sources = ['x =', 'x = = 1', 'if:\n    a()', 'for in x:\n    a()', 'for i x:\n    a()',
      'def f(:\n    pass', 'x = [1, 2', 'return = 3', 'global', 'a.1', 'x = 1 +',
      'while True:\n    a()\n  b()', 'class A:\n    pass', 'x = lambda: 1', 'else', '\\',
      'a = b = 1', 'x = {1}', 'while True: a()']
    for (const src of sources) {
      let err: unknown
      try { parseSource(src) } catch (e) { err = e }
      expect(err, src).toBeInstanceOf(LangError)
      expect((err as LangError).kind, src).toBe('syntax')
    }
  })
})
