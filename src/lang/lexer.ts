import { LangError } from './errors'

export type TokenType = 'num' | 'str' | 'name' | 'kw' | 'op' | 'newline' | 'indent' | 'dedent' | 'eof'
export interface Token { type: TokenType; value: string; line: number }

export const KEYWORDS = new Set([
  'while', 'if', 'elif', 'else', 'for', 'in', 'def', 'return', 'break', 'continue', 'pass',
  'global', 'and', 'or', 'not', 'is', 'True', 'False', 'None',
])
export const UNSUPPORTED = new Set([
  'class', 'import', 'from', 'try', 'except', 'finally', 'raise', 'with', 'as', 'lambda',
  'yield', 'del', 'assert', 'nonlocal', 'async', 'await',
])

// 긴 연산자를 먼저 검사해야 '**='이 '*'로 잘리지 않는다.
const OPS = [
  '**=', '//=', '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=',
  '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', ':', '.',
]
const CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
const NAME_START = /[A-Za-z_ㄱ-힝]/
const NAME_PART = /[A-Za-z0-9_ㄱ-힝]/

export function tokenize(source: string): Token[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const tokens: Token[] = []
  const indents = [0]
  const open: { ch: string; line: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = lines[i]
    let pos = 0

    if (open.length === 0) {
      let width = 0
      while (pos < raw.length && (raw[pos] === ' ' || raw[pos] === '\t')) {
        width += raw[pos] === '\t' ? 4 : 1
        pos++
      }
      if (pos >= raw.length || raw[pos] === '#') continue
      if (width > indents[indents.length - 1]) {
        indents.push(width)
        tokens.push({ type: 'indent', value: '', line: lineNo })
      } else {
        while (width < indents[indents.length - 1]) {
          indents.pop()
          tokens.push({ type: 'dedent', value: '', line: lineNo })
        }
        if (width !== indents[indents.length - 1]) {
          throw new LangError('들여쓰기가 맞지 않습니다. 같은 블록에 속한 줄은 같은 칸 수만큼 들여 써야 합니다.', lineNo, 'syntax')
        }
      }
    }

    while (pos < raw.length) {
      const ch = raw[pos]
      if (ch === ' ' || ch === '\t') { pos++; continue }
      if (ch === '#') break
      if (/[0-9]/.test(ch)) {
        const m = /^[0-9]+(\.[0-9]+)?/.exec(raw.slice(pos))!
        tokens.push({ type: 'num', value: m[0], line: lineNo })
        pos += m[0].length
        continue
      }
      if (ch === '"' || ch === "'") {
        const end = raw.indexOf(ch, pos + 1)
        if (end < 0) throw new LangError('문자열을 닫는 따옴표가 없습니다.', lineNo, 'syntax')
        tokens.push({ type: 'str', value: raw.slice(pos + 1, end), line: lineNo })
        pos = end + 1
        continue
      }
      if (NAME_START.test(ch)) {
        let end = pos + 1
        while (end < raw.length && NAME_PART.test(raw[end])) end++
        const word = raw.slice(pos, end)
        const type = KEYWORDS.has(word) || UNSUPPORTED.has(word) ? 'kw' : 'name'
        tokens.push({ type, value: word, line: lineNo })
        pos = end
        continue
      }
      const op = OPS.find(o => raw.startsWith(o, pos))
      if (!op) throw new LangError(`사용할 수 없는 문자입니다: ${ch}`, lineNo, 'syntax')
      if (op === '(' || op === '[' || op === '{') open.push({ ch: op, line: lineNo })
      if (op === ')' || op === ']' || op === '}') {
        const top = open.pop()
        if (!top) throw new LangError(`여는 괄호 없이 '${op}'가 나왔습니다.`, lineNo, 'syntax')
        if (CLOSERS[top.ch] !== op) {
          throw new LangError(`괄호의 짝이 맞지 않습니다. '${CLOSERS[top.ch]}'가 필요한 자리에 '${op}'가 나왔습니다.`, lineNo, 'syntax')
        }
      }
      tokens.push({ type: 'op', value: op, line: lineNo })
      pos += op.length
    }

    if (open.length === 0 && tokens.length > 0 && tokens[tokens.length - 1].type !== 'newline') {
      tokens.push({ type: 'newline', value: '', line: lineNo })
    }
  }

  if (open.length > 0) {
    const top = open[open.length - 1]
    throw new LangError(`괄호가 닫히지 않았습니다. '${CLOSERS[top.ch]}'가 필요합니다.`, top.line, 'syntax')
  }

  const last = lines.length
  if (tokens.length > 0 && tokens[tokens.length - 1].type !== 'newline' && tokens[tokens.length - 1].type !== 'dedent') {
    tokens.push({ type: 'newline', value: '', line: last })
  }
  while (indents.length > 1) {
    indents.pop()
    tokens.push({ type: 'dedent', value: '', line: last })
  }
  tokens.push({ type: 'eof', value: '', line: last })
  return tokens
}
