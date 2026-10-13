import { describe, expect, test } from 'vitest'
import { tokenize } from '../../src/lang/lexer'
import { LangError } from '../../src/lang/errors'

const kinds = (src: string) => tokenize(src).map(t => (t.type === 'newline' || t.type === 'indent' || t.type === 'dedent' || t.type === 'eof' ? t.type : t.value))

describe('tokenize', () => {
  test('함수 호출 한 줄', () => {
    expect(kinds('harvest()')).toEqual(['harvest', '(', ')', 'newline', 'eof'])
  })

  test('들여쓰기를 블록 시작과 끝 토큰으로 바꾼다', () => {
    expect(kinds('while True:\n    harvest()\nmove(Right)')).toEqual([
      'while', 'True', ':', 'newline', 'indent', 'harvest', '(', ')', 'newline', 'dedent',
      'move', '(', 'Right', ')', 'newline', 'eof',
    ])
  })

  test('파일 끝에서 열린 블록을 모두 닫는다', () => {
    const t = kinds('if a:\n  if b:\n    c()')
    expect(t.filter(k => k === 'dedent').length).toBe(2)
  })

  test('빈 줄과 주석 줄은 들여쓰기에 영향을 주지 않는다', () => {
    expect(kinds('while True:\n    a()\n\n# 주석\n    b()')).toEqual([
      'while', 'True', ':', 'newline', 'indent', 'a', '(', ')', 'newline', 'b', '(', ')', 'newline', 'dedent', 'eof',
    ])
  })

  test('줄 끝 주석을 무시한다', () => {
    expect(kinds('a()  # 설명')).toEqual(['a', '(', ')', 'newline', 'eof'])
  })

  test('두 글자와 세 글자 연산자', () => {
    expect(kinds('a //= b ** 2 != c <= d')).toEqual(['a', '//=', 'b', '**', '2', '!=', 'c', '<=', 'd', 'newline', 'eof'])
  })

  test('숫자와 문자열', () => {
    const t = tokenize('x = 3.5\ny = "안녕"\nz = \'a\'')
    expect(t.filter(k => k.type === 'num').map(k => k.value)).toEqual(['3.5'])
    expect(t.filter(k => k.type === 'str').map(k => k.value)).toEqual(['안녕', 'a'])
  })

  test('괄호 안의 줄바꿈은 문장을 끝내지 않는다', () => {
    expect(kinds('x = [1,\n     2]')).toEqual(['x', '=', '[', '1', ',', '2', ']', 'newline', 'eof'])
  })

  test('줄 번호를 기록한다', () => {
    const t = tokenize('a()\n\nb()')
    expect(t.find(k => k.value === 'b')!.line).toBe(3)
  })

  test('CRLF 줄바꿈과 탭 들여쓰기를 받아들인다', () => {
    expect(kinds('while True:\r\n\tharvest()\r\n')).toEqual([
      'while', 'True', ':', 'newline', 'indent', 'harvest', '(', ')', 'newline', 'dedent', 'eof',
    ])
  })

  test('빈 소스와 주석만 있는 소스', () => {
    expect(kinds('')).toEqual(['eof'])
    expect(kinds('# 아무것도 없음\n')).toEqual(['eof'])
  })

  test('맞지 않는 내어쓰기는 구문 오류이다', () => {
    try {
      tokenize('if a:\n        b()\n    c()')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LangError)
      expect((e as LangError).line).toBe(3)
      expect((e as LangError).kind).toBe('syntax')
      expect((e as LangError).message).toContain('들여쓰기')
    }
  })

  test('닫히지 않은 문자열과 알 수 없는 문자는 구문 오류이다', () => {
    expect(() => tokenize('x = "abc')).toThrow(/따옴표/)
    expect(() => tokenize('x = 3 $ 4')).toThrow(/사용할 수 없는 문자/)
  })

  test('닫히지 않은 괄호는 여는 괄호가 있는 줄을 알려 준다', () => {
    try {
      tokenize('move(Right\nharvest()')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LangError)
      expect((e as LangError).line).toBe(1)
      expect((e as LangError).kind).toBe('syntax')
      expect((e as LangError).message).toContain(')')
    }
    try {
      tokenize('a()\nx = [1,\n 2')
      expect.unreachable()
    } catch (e) {
      expect((e as LangError).line).toBe(2)
      expect((e as LangError).message).toContain(']')
    }
  })

  test('짝 없는 닫는 괄호와 짝이 맞지 않는 괄호는 구문 오류이다', () => {
    try {
      tokenize('a()\nharvest())')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LangError)
      expect((e as LangError).line).toBe(2)
      expect((e as LangError).kind).toBe('syntax')
    }
    try {
      tokenize('x = (1, 2]')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(LangError)
      expect((e as LangError).line).toBe(1)
      expect((e as LangError).message).toContain('짝')
    }
  })
})
