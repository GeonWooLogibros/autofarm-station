# 오토팜 스테이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 우주정거장 온실에서 드론을 파이썬 문법으로 코딩하여 재배를 자동화하고, 수확물로 문법·작물·선반을 해금하는 웹 게임을 만든다.

**Architecture:** 코드는 `lang`(파이썬 일부를 해석하는 실행기), `sim`(화면과 분리된 온실 시뮬레이션), `progress`(해금·안내·저장·게임 제어), `ui`(편집기와 SVG 화면)의 네 부분으로 나눈다. 실행기는 제너레이터로 구현하여 틱 예산만큼만 실행하고 멈출 수 있고, 드론 함수는 외부에서 주입받는다. `progress/game.ts`의 `Game`은 화면 없이도 게임 전체를 진행시킬 수 있어서, 해금 비용의 균형을 자동 테스트로 조정한다.

**Tech Stack:** Vite 7, TypeScript 5.9, Vitest 3, CodeMirror 6(`codemirror`, `@codemirror/lang-python`). 화면 프레임워크는 사용하지 않는다.

**Spec:** `docs/superpowers/specs/2026-10-08-gardener-replaced-design.md`

## Global Constraints

- 모든 사용자 노출 문구는 한국어로 쓴다. 버튼은 "실행하기", "해금하기"처럼 "~하기" 또는 명사형, 설명과 안내와 오류 문구는 합니다체로 쓴다.
- PC 브라우저와 키보드가 기준이다. 최종 산출물은 HTML 파일 하나로 실행되어야 한다(`../tools/build-artifact.mjs` 사용).
- `localStorage`는 `gardener-replaced:`로 시작하는 키만 읽고 쓰고 지운다. `localStorage.clear()`는 절대 호출하지 않는다.
- `sim`과 `lang`은 DOM, `window`, `Date.now()`, `Math.random()`을 사용하지 않는다. 시간은 인자로 받고, 난수는 시드 생성기를 사용한다.
- 의존 방향은 `ui → progress → sim`, `ui → lang`, `progress → lang`이다. `lang`은 `sim`을 import하지 않는다.
- 동작 함수는 200틱, 감지 함수와 그 밖의 문장은 1틱이다. 드론의 기본 속도는 초당 400틱이다.
- 분홍색 위주의 배색을 쓰지 않는다. 기준 색은 드론 그림의 청록색(`#0f8b8d` 계열)과 흰색이다.
- 구현은 `feat/game` 브랜치에서 진행한다. 커밋 메시지는 `feat: 한국어 설명` 형식이고, 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 줄을 붙인다.
- 각 Task의 테스트 코드는 계약이다. 구현 단계에 적힌 코드와 테스트가 어긋나면 테스트와 설계 문서를 기준으로 삼는다.

## Review Focus

1. **Windows 줄바꿈(CRLF)이나 탭 들여쓰기가 섞인 코드를 붙여 넣는 경우:** 정상적으로 해석되어야 한다. (Task 2에 테스트)
2. **브라우저 탭을 숨겼다가 돌아와서 한 프레임의 경과 시간이 수 분인 경우:** 게임이 멈추거나 수 분 치를 한꺼번에 계산하지 않고, 한 프레임에 최대 250ms만 진행해야 한다. (Task 9에 테스트)
3. **무한 반복 안에서 `print()`를 호출하는 경우:** 출력 줄 수가 200줄로 제한되어 메모리가 계속 늘지 않아야 한다. (Task 9에 테스트)
4. **프로그램이 실행되는 중에 선반 확장을 해금하는 경우:** 드론 위치와 기존 화분이 유지되고 프로그램이 오류 없이 계속 실행되어야 한다. (Task 9에 테스트)
5. **`localStorage`에 저장할 수 없거나(용량 초과, 비공개 창) 저장 데이터가 깨진 경우:** 게임이 멈추지 않고 계속 진행되어야 하며, 깨진 데이터는 별도 키에 보존해야 한다. (Task 10에 테스트)

## File Structure

```
index.html                 화면 뼈대
package.json, tsconfig.json, vite.config.ts
scripts/fetch-assets.mjs   코드모스 에셋 내려받기
assets/SOURCES.md          사용한 에셋의 ID와 주소
src/
  main.ts                  진입점: 저장 불러오기, 화면 생성, 프레임 반복
  style.css
  lang/
    errors.ts              LangError
    lexer.ts               소스 → 토큰(들여쓰기 처리 포함)
    ast.ts                 구문 트리 타입
    parser.ts              토큰 → 구문 트리
    values.ts              값 타입, repr, 비교, host() 도우미
    builtins.ts            range, len, min, max, abs
    interpreter.ts         Program: 틱 예산 단위 실행
    checker.ts             잠긴 문법·이름 검사
    index.ts               compile()
  sim/
    types.ts               PlantKind, ItemKind, Dir, Cell, WorldState, WorldEvent
    balance.ts             성장 시간, 심는 비용, 수확량
    rng.ts                 시드 난수
    rules.ts               튤립 이웃, 토마토 정사각형, 상자 정리 판정
    world.ts               World
  progress/
    unlocks.ts             해금 정의와 구입 조건
    droneApi.ts            World를 실행기의 전역 함수로 연결
    game.ts                Game: 실행 제어, 해금, 시간 진행
    guide.ts               해금별 안내 문구와 예제
    save.ts                저장, 불러오기, 초기화
  ui/
    sprites.ts             그림 import 모음
    editor.ts              CodeMirror 래퍼
    greenhouse.ts          온실 SVG
    panels.ts              해금 화면, 설명서, 설정, 엔딩
    guideBubble.ts         인트 말풍선
    audio.ts               효과음
    app.ts                 화면 조립과 이벤트 연결
  assets/codmos/           내려받은 그림과 소리
tests/
  lang/…  sim/…  progress/…  balance.test.ts
```

---

### Task 1: 프로젝트 뼈대

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`, `src/vite-env.d.ts`, `.gitignore`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm test` 명령. 테스트는 `tests/**/*.test.ts`에 둔다.

- [ ] **Step 1: 브랜치 생성과 패키지 설치**

```bash
git checkout -b feat/game
npm init -y
npm install codemirror @codemirror/lang-python @codemirror/state @codemirror/view @codemirror/language
npm install -D vite@^7 typescript@~5.9 vitest@^3
```

- [ ] **Step 2: 설정 파일 작성**

`package.json`의 `name`을 `gardener-replaced`, `private`를 `true`, `type`을 `module`로 하고 scripts를 다음으로 바꾼다.

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true, "skipLibCheck": true, "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: { assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
```

`.gitignore`: `node_modules`, `dist`, `*.local`.

`src/vite-env.d.ts`: `/// <reference types="vite/client" />`

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>정원사는 대체되었다</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`: `import './style.css'` 한 줄. `src/style.css`: 빈 파일.

- [ ] **Step 3: 동작 확인용 테스트 작성**

`tests/smoke.test.ts`:

```ts
import { expect, test } from 'vitest'

test('테스트 환경이 동작한다', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 4: 확인**

Run: `npm test && npm run build`
Expected: 테스트 1개 통과, 빌드 성공.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 프로젝트 뼈대 구성"
```

---

### Task 2: 실행기 — 토큰 분석

**Files:**
- Create: `src/lang/errors.ts`, `src/lang/lexer.ts`
- Test: `tests/lang/lexer.test.ts`

**Interfaces:**
- Produces:
  - `class LangError extends Error { line: number; kind: 'syntax' | 'locked' | 'runtime' }`, 생성자는 `(message, line, kind)`
  - `type TokenType = 'num' | 'str' | 'name' | 'kw' | 'op' | 'newline' | 'indent' | 'dedent' | 'eof'`
  - `interface Token { type: TokenType; value: string; line: number }` (`line`은 1부터 시작)
  - `tokenize(source: string): Token[]`
  - `KEYWORDS: Set<string>`, `UNSUPPORTED: Set<string>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lang/lexer.test.ts`:

```ts
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
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/lang/lexer.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현**

`src/lang/errors.ts`:

```ts
export type ErrorKind = 'syntax' | 'locked' | 'runtime'

export class LangError extends Error {
  constructor(message: string, public line: number, public kind: ErrorKind) {
    super(message)
  }
}
```

`src/lang/lexer.ts`:

```ts
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
const NAME_START = /[A-Za-z_\u3131-\uD79D]/
const NAME_PART = /[A-Za-z0-9_\u3131-\uD79D]/

export function tokenize(source: string): Token[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const tokens: Token[] = []
  const indents = [0]
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = lines[i]
    let pos = 0

    if (depth === 0) {
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
      if (op === '(' || op === '[' || op === '{') depth++
      if (op === ')' || op === ']' || op === '}') depth = Math.max(0, depth - 1)
      tokens.push({ type: 'op', value: op, line: lineNo })
      pos += op.length
    }

    if (depth === 0 && tokens.length > 0 && tokens[tokens.length - 1].type !== 'newline') {
      tokens.push({ type: 'newline', value: '', line: lineNo })
    }
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/lang/lexer.test.ts`
Expected: PASS. 실패하는 경우가 있으면 테스트에 맞게 구현을 고친다.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 실행기 토큰 분석 추가"
```

---

### Task 3: 실행기 — 구문 분석

**Files:**
- Create: `src/lang/ast.ts`, `src/lang/parser.ts`
- Test: `tests/lang/parser.test.ts`

**Interfaces:**
- Consumes: `tokenize`, `Token`, `UNSUPPORTED`, `LangError`
- Produces: `parse(tokens: Token[]): Stmt[]`, `parseSource(source: string): Stmt[]`, 그리고 아래 구문 트리 타입

`src/lang/ast.ts` (그대로 작성한다):

```ts
export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not in'
export type BinOp = '+' | '-' | '*' | '/' | '//' | '%' | '**'

export type Expr =
  | { t: 'Num'; v: number; line: number }
  | { t: 'Str'; v: string; line: number }
  | { t: 'Const'; v: true | false | null; line: number }
  | { t: 'Name'; id: string; line: number }
  | { t: 'List'; items: Expr[]; line: number }
  | { t: 'Tuple'; items: Expr[]; line: number }
  | { t: 'Dict'; entries: [Expr, Expr][]; line: number }
  | { t: 'Unary'; op: '-' | 'not'; e: Expr; line: number }
  | { t: 'Bin'; op: BinOp; l: Expr; r: Expr; line: number }
  | { t: 'Bool'; op: 'and' | 'or'; l: Expr; r: Expr; line: number }
  | { t: 'Cmp'; first: Expr; rest: { op: CmpOp; e: Expr }[]; line: number }
  | { t: 'Call'; fn: Expr; args: Expr[]; line: number }
  | { t: 'Index'; obj: Expr; idx: Expr; line: number }
  | { t: 'Attr'; obj: Expr; name: string; line: number }

export type Stmt =
  | { t: 'Expr'; e: Expr; line: number }
  | { t: 'Assign'; target: Expr; value: Expr; line: number }
  | { t: 'Aug'; target: Expr; op: BinOp; value: Expr; line: number }
  | { t: 'If'; branches: { cond: Expr; body: Stmt[] }[]; orelse: Stmt[]; line: number }
  | { t: 'While'; cond: Expr; body: Stmt[]; line: number }
  | { t: 'For'; name: string; iter: Expr; body: Stmt[]; line: number }
  | { t: 'Def'; name: string; params: string[]; body: Stmt[]; line: number }
  | { t: 'Return'; value: Expr | null; line: number }
  | { t: 'Break'; line: number }
  | { t: 'Continue'; line: number }
  | { t: 'Pass'; line: number }
  | { t: 'Global'; names: string[]; line: number }
```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lang/parser.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseSource } from '../../src/lang/parser'
import { LangError } from '../../src/lang/errors'

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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/lang/parser.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현**

`src/lang/parser.ts`를 재귀 하강 방식으로 작성한다. `class Parser`가 토큰 배열과 현재 위치를 가지며, 다음 도우미를 둔다.

```ts
private peek(): Token
private next(): Token
private isOp(v: string): boolean          // 현재 토큰이 op이고 값이 v인가
private isKw(v: string): boolean
private expectOp(v: string, hint: string): Token   // 아니면 LangError(hint, 줄, 'syntax')
```

문법과 함수 구성은 다음과 같다. 우선순위가 낮은 것부터 높은 순서로 호출한다.

```
program    := stmt* eof
stmt       := simple newline | if | while | for | def
simple     := 'pass' | 'break' | 'continue' | 'return' [expr] | 'global' NAME (',' NAME)*
            | expr ('=' expr | AUGOP expr)?
block      := ':' newline indent stmt+ dedent
expr       := or
or         := and ('or' and)*
and        := not ('and' not)*
not        := 'not' not | cmp
cmp        := arith ((== != < <= > >= | 'in' | 'not' 'in' | 'is' ['not']) arith)*
arith      := term (('+' | '-') term)*
term       := unary (('*' | '/' | '//' | '%') unary)*
unary      := '-' unary | power
power      := postfix ['**' unary]
postfix    := atom ( '(' args ')' | '[' expr ']' | '.' NAME )*
atom       := NUM | STR | NAME | True | False | None
            | '(' expr ')' | '(' expr ',' [expr (',' expr)*] ')' | '(' ')'
            | '[' [expr (',' expr)*] ']' | '{' [expr ':' expr (',' expr ':' expr)*] '}'
```

구현 규칙:

- `is`는 `==`, `is not`은 `!=`으로 바꾸어 `Cmp`에 넣는다.
- `Cmp`는 비교 연산자가 하나도 없으면 만들지 않고 `first`를 그대로 돌려준다.
- 대입의 대상은 `Name` 또는 `Index`만 허용한다. 그 밖에는 `'이 자리에는 값을 대입할 수 없습니다. 변수 이름이나 리스트[번호] 형태만 대입할 수 있습니다.'` 오류를 낸다.
- 식 문장 뒤에 `,`가 오고 그 뒤에 `=`가 이어지는 경우(`a, b = ...`)를 포함하여, `UNSUPPORTED`에 속한 키워드를 만나면 `` `'${word}'는 이 게임에서 지원하지 않는 문법입니다.` `` 오류를 낸다. `a, b = 1, 2`는 `'여러 변수에 한꺼번에 대입하는 것은 이 게임에서 지원하지 않는 문법입니다.'`로 안내한다.
- 블록 머리(`while`, `if`, `elif`, `else`, `for`, `def`) 뒤에 `:`가 없으면 `` `'${kw}' 줄의 끝에 콜론(:)이 필요합니다.` ``를 낸다. 줄 번호는 그 머리 줄이다.
- `:`와 줄바꿈 뒤에 `indent`가 없으면 `` `'${kw}' 다음 줄은 안쪽으로 들여 써야 합니다.` ``를 낸다.
- 닫는 괄호가 없으면 `` `괄호가 닫히지 않았습니다. '${닫는 문자}'가 필요합니다.` ``를 낸다.
- 그 밖에 예상하지 못한 토큰은 `` `이 줄을 이해할 수 없습니다: '${token.value}' 근처를 확인해 주세요.` ``로 안내한다.
- 모든 노드의 `line`은 그 노드를 시작한 토큰의 줄 번호이다.

마지막에 다음을 내보낸다.

```ts
export function parse(tokens: Token[]): Stmt[] { return new Parser(tokens).program() }
export function parseSource(source: string): Stmt[] { return parse(tokenize(source)) }
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/lang`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 실행기 구문 분석 추가"
```

---

### Task 4: 실행기 — 값과 실행

**Files:**
- Create: `src/lang/values.ts`, `src/lang/builtins.ts`, `src/lang/interpreter.ts`, `tests/lang/helpers.ts`
- Test: `tests/lang/interpreter.test.ts`

**Interfaces:**
- Consumes: `parseSource`, `Stmt`, `Expr`, `LangError`
- Produces:

```ts
// values.ts
export interface PyList { k: 'list'; items: Value[] }
export interface PyTuple { k: 'tuple'; items: Value[] }
export interface PyDict { k: 'dict'; map: Map<string, { key: Value; value: Value }> }
export interface PyFunc { k: 'func'; name: string; params: string[]; body: Stmt[] }
export interface HostFunc { k: 'host'; name: string; ticks: number; minArgs: number; maxArgs: number; call: (args: Value[]) => Value }
export interface PyConst { k: 'const'; name: string }
export type Value = number | boolean | null | string | PyList | PyTuple | PyDict | PyFunc | HostFunc | PyConst

export function host(name: string, ticks: number, minArgs: number, maxArgs: number, call: (args: Value[]) => Value): HostFunc
export function constant(name: string): PyConst      // 같은 이름이면 항상 같은 객체를 돌려준다
export function truthy(v: Value): boolean
export function equals(a: Value, b: Value): boolean
export function repr(v: Value): string               // 문자열은 따옴표를 붙인다
export function display(v: Value): string            // print용: 문자열은 따옴표 없이
export function typeName(v: Value): string           // '숫자', '참/거짓', 'None', '문자열', '리스트', '튜플', '딕셔너리', '함수', '상수'

// builtins.ts
export function builtins(): Map<string, Value>       // range, len, min, max, abs

// interpreter.ts
export interface StepResult { status: 'running' | 'done' | 'error'; line: number; error?: LangError }
export class Program {
  constructor(ast: Stmt[], globals: Map<string, Value>)
  step(ticks: number): StepResult        // 틱 예산만큼 실행
  stepStatement(): StepResult            // 문장 하나만 실행
  readonly line: number                  // 지금 실행 중인 줄
}
```

HostFunc의 `call`이 `Error`를 던지면 실행기가 그 메시지와 호출한 줄 번호로 `LangError(…, 'runtime')`를 만든다.

- [ ] **Step 1: 테스트 도우미와 실패하는 테스트 작성**

`tests/lang/helpers.ts`:

```ts
import { parseSource } from '../../src/lang/parser'
import { Program, type StepResult } from '../../src/lang/interpreter'
import { builtins } from '../../src/lang/builtins'
import { display, host, type Value } from '../../src/lang/values'
import { LangError } from '../../src/lang/errors'

export function run(source: string, extra: Record<string, Value> = {}, maxTicks = 100000) {
  const out: string[] = []
  const globals = builtins()
  globals.set('print', host('print', 1, 1, 1, a => { out.push(display(a[0])); return null }))
  for (const [k, v] of Object.entries(extra)) globals.set(k, v)
  let result: StepResult
  let program: Program | null = null
  try {
    program = new Program(parseSource(source), globals)
    result = program.step(maxTicks)
  } catch (e) {
    if (!(e instanceof LangError)) throw e
    result = { status: 'error', line: e.line, error: e }
  }
  return { out, result, program }
}
```

`tests/lang/interpreter.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { run } from './helpers'
import { host, constant, type Value } from '../../src/lang/values'
import { parseSource } from '../../src/lang/parser'
import { Program } from '../../src/lang/interpreter'

describe('식과 변수', () => {
  test('산술 연산', () => {
    expect(run('print(1 + 2 * 3)\nprint(7 // 2)\nprint(7 / 2)\nprint(2 ** 10)\nprint(-7 % 3)\nprint(-7 // 2)').out)
      .toEqual(['7', '3', '3.5', '1024', '2', '-4'])
  })

  test('변수와 복합 대입', () => {
    expect(run('x = 3\nx += 2\nx *= 4\nprint(x)').out).toEqual(['20'])
  })

  test('비교와 논리 연산', () => {
    expect(run('print(1 < 2 < 3)\nprint(1 < 2 > 5)\nprint(not True or False)\nprint(None == None)\nprint(1 == True)').out)
      .toEqual(['True', 'False', 'False', 'True', 'False'])
  })

  test('and와 or는 필요한 만큼만 계산한다', () => {
    let calls = 0
    const f = host('f', 1, 0, 0, () => { calls++; return true })
    run('x = False and f()\ny = True or f()', { f })
    expect(calls).toBe(0)
  })

  test('문자열 이어 붙이기와 출력', () => {
    expect(run('print("딸기 " + "수확")\nprint([1, "a", None, True])').out).toEqual(['딸기 수확', "[1, 'a', None, True]"])
  })
})

describe('흐름 제어', () => {
  test('if / elif / else', () => {
    expect(run('x = 5\nif x < 3:\n    print("a")\nelif x < 10:\n    print("b")\nelse:\n    print("c")').out).toEqual(['b'])
  })

  test('while, break, continue', () => {
    const src = 'i = 0\nwhile True:\n    i += 1\n    if i == 2:\n        continue\n    if i > 4:\n        break\n    print(i)'
    expect(run(src).out).toEqual(['1', '3', '4'])
  })

  test('for와 range', () => {
    expect(run('for i in range(3):\n    print(i)').out).toEqual(['0', '1', '2'])
    expect(run('for i in range(2, 5):\n    print(i)').out).toEqual(['2', '3', '4'])
    expect(run('for i in range(5, 0, -2):\n    print(i)').out).toEqual(['5', '3', '1'])
  })
})

describe('함수', () => {
  test('정의, 호출, 반환값', () => {
    expect(run('def add(a, b):\n    return a + b\nprint(add(2, 3))').out).toEqual(['5'])
  })

  test('return이 없으면 None을 돌려준다', () => {
    expect(run('def f():\n    pass\nprint(f())').out).toEqual(['None'])
  })

  test('함수 안의 대입은 지역 변수이고, global을 쓰면 전역 변수를 바꾼다', () => {
    expect(run('n = 1\ndef f():\n    n = 5\nf()\nprint(n)').out).toEqual(['1'])
    expect(run('n = 1\ndef g():\n    global n\n    n = 5\ng()\nprint(n)').out).toEqual(['5'])
  })

  test('함수 안에서 전역 변수를 읽을 수 있다', () => {
    expect(run('n = 7\ndef f():\n    return n + 1\nprint(f())').out).toEqual(['8'])
  })

  test('재귀', () => {
    expect(run('def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\nprint(fact(5))').out).toEqual(['120'])
  })

  test('반복 안에서 return하면 함수가 끝난다', () => {
    expect(run('def f():\n    while True:\n        return 3\nprint(f())').out).toEqual(['3'])
  })
})

describe('리스트, 튜플, 딕셔너리', () => {
  test('리스트 인덱싱과 메서드', () => {
    const src = 'a = [3, 1]\na.append(2)\na.insert(0, 9)\nprint(a)\nprint(a.pop())\na.remove(9)\nprint(a)\nprint(a[-1])\nprint(len(a))\na[0] = 7\nprint(a)'
    expect(run(src).out).toEqual(['[9, 3, 1, 2]', '2', '[3, 1]', '1', '2', '[7, 1]'])
  })

  test('min, max, abs, in', () => {
    expect(run('a = [4, 9, 2]\nprint(max(a))\nprint(min(a))\nprint(max(3, 8))\nprint(abs(-4))\nprint(9 in a)\nprint(5 not in a)').out)
      .toEqual(['9', '2', '8', '4', 'True', 'True'])
  })

  test('리스트는 같은 객체를 가리킨다', () => {
    expect(run('a = [1]\nb = a\nb.append(2)\nprint(a)').out).toEqual(['[1, 2]'])
  })

  test('튜플은 값으로 비교하고 딕셔너리의 키가 된다', () => {
    expect(run('p = (1, 2)\nprint(p == (1, 2))\nprint(p[1])\nd = {}\nd[p] = "여기"\nprint(d[(1, 2)])').out).toEqual(['True', '2', '여기'])
  })

  test('딕셔너리 조회, 대입, in, 순회', () => {
    const src = 'd = {"a": 1}\nd["b"] = 2\nprint(d["a"] + d["b"])\nprint("a" in d)\nfor k in d:\n    print(k)\nprint(len(d))'
    expect(run(src).out).toEqual(['3', 'True', 'a', 'b', '2'])
  })

  test('상수는 서로 비교할 수 있고 딕셔너리의 키가 된다', () => {
    const src = 'print(a == b)\nprint(a == a)\nd = {a: 1}\nprint(d[a])'
    expect(run(src, { a: constant('Daisy'), b: constant('Tulip') }).out).toEqual(['False', 'True', '1'])
  })
})

describe('실행 중 오류', () => {
  const err = (src: string, extra: Record<string, Value> = {}) => run(src, extra).result

  test('없는 이름', () => {
    const r = err('x = 1\nprint(y)')
    expect(r.status).toBe('error')
    expect(r.line).toBe(2)
    expect(r.error!.kind).toBe('runtime')
    expect(r.error!.message).toContain("'y'")
  })

  test('0으로 나누기, 인덱스 범위, 없는 키', () => {
    expect(err('x = 1 / 0').error!.message).toContain('0으로 나눌 수 없습니다')
    expect(err('a = [1]\nprint(a[3])').error!.message).toContain('범위')
    expect(err('d = {}\nprint(d["k"])').error!.message).toContain('키')
  })

  test('자료형이 맞지 않는 연산', () => {
    expect(err('x = 1 + "a"').error!.message).toContain('숫자')
    expect(err('x = 3\nx()').error!.message).toContain('함수가 아닙니다')
  })

  test('인자 개수가 맞지 않는 호출', () => {
    expect(err('def f(a):\n    pass\nf()').error!.message).toContain('인자')
    expect(err('f(1, 2)', { f: host('f', 1, 0, 1, () => null) }).error!.message).toContain('인자')
  })

  test('재귀가 200단계를 넘으면 오류이다', () => {
    const r = err('def f():\n    f()\nf()')
    expect(r.status).toBe('error')
    expect(r.error!.message).toContain('너무 깊')
  })

  test('외부 함수가 던진 오류에 줄 번호를 붙인다', () => {
    const r = err('x = 1\nboom()', { boom: host('boom', 1, 0, 0, () => { throw new Error('고장') }) })
    expect(r.line).toBe(2)
    expect(r.error!.message).toBe('고장')
  })

  test('함수 밖의 return, 반복 밖의 break', () => {
    expect(err('return 1').error!.message).toContain('함수 안')
    expect(err('break').error!.message).toContain('반복 안')
  })

  test('range가 지나치게 크면 오류이다', () => {
    expect(err('for i in range(10 ** 9):\n    pass').error!.message).toContain('너무')
  })
})

describe('틱 예산', () => {
  const act = (log: string[]) => host('act', 200, 0, 0, () => { log.push('act'); return true })

  test('무한 반복은 예산만큼만 실행하고 running을 돌려준다', () => {
    const p = new Program(parseSource('while True:\n    pass'), new Map())
    const r = p.step(1000)
    expect(r.status).toBe('running')
  })

  test('동작 하나는 200틱을 쓰고, 부족한 틱은 다음 호출에서 갚는다', () => {
    const log: string[] = []
    const p = new Program(parseSource('while True:\n    act()'), new Map([['act', act(log)]]))
    p.step(10)                       // 첫 동작은 곧바로 실행하고 빚이 생긴다
    expect(log.length).toBe(1)
    for (let i = 0; i < 15; i++) p.step(10)   // 150틱: 아직 빚을 갚는 중
    expect(log.length).toBe(1)
    for (let i = 0; i < 10; i++) p.step(10)   // 합계 260틱: 두 번째 동작
    expect(log.length).toBe(2)
  })

  test('프로그램이 끝나면 done을 돌려주고, 다시 호출해도 done이다', () => {
    const p = new Program(parseSource('x = 1'), new Map())
    expect(p.step(100).status).toBe('done')
    expect(p.step(100).status).toBe('done')
  })

  test('빈 프로그램은 곧바로 done이다', () => {
    expect(new Program(parseSource('# 주석만'), new Map()).step(10).status).toBe('done')
  })

  test('line은 지금 실행 중인 문장의 줄이다', () => {
    const log: string[] = []
    const p = new Program(parseSource('x = 1\nact()\ny = 2'), new Map([['act', act(log)]]))
    const r = p.step(5)
    expect(r.line).toBe(2)
  })

  test('stepStatement는 문장 하나만 실행한다', () => {
    const lines: string[] = []
    const print = host('print', 1, 1, 1, a => { lines.push(String(a[0])); return null })
    const p = new Program(parseSource('print(1)\nprint(2)\nprint(3)'), new Map([['print', print]]))
    p.stepStatement()
    expect(lines).toEqual(['1'])
    p.stepStatement()
    expect(lines).toEqual(['1', '2'])
    expect(p.stepStatement().status).toBe('done')
    expect(lines).toEqual(['1', '2', '3'])
    expect(p.stepStatement().status).toBe('done')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/lang/interpreter.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: values.ts와 builtins.ts 구현**

`values.ts` 구현 규칙:

- `constant(name)`은 모듈 안의 `Map<string, PyConst>`에 보관하여 같은 이름에는 같은 객체를 돌려준다.
- `truthy`: `false`, `null`, `0`, `''`, 빈 리스트·튜플·딕셔너리는 거짓이고 나머지는 참이다.
- `equals`: 숫자와 참/거짓은 서로 다르다(`1 == True`는 거짓으로 둔다. 입문자가 헷갈리지 않게 하기 위함이다). 리스트와 튜플은 길이와 원소를 재귀적으로 비교한다. 그 밖의 객체는 동일 객체인지로 비교한다.
- `repr`: 참/거짓은 `True`/`False`, `null`은 `None`, 문자열은 작은따옴표로 감싼다. 리스트는 `[1, 2]`, 튜플은 `(1, 2)`(원소 하나면 `(1,)`), 딕셔너리는 `{'a': 1}`, 상수는 이름, 함수는 `<함수 이름>`으로 표시한다. 숫자는 `String(n)`을 사용한다.
- 딕셔너리의 키 문자열은 `keyOf(v: Value): string`으로 만들고 `typeof` 접두어를 붙여 `1`과 `'1'`이 겹치지 않게 한다. 숫자, 문자열, 참/거짓, None, 상수, 튜플만 키가 될 수 있고, 그 밖에는 `Error('리스트나 딕셔너리는 딕셔너리의 키로 사용할 수 없습니다.')`를 던진다. `keyOf`도 내보낸다.

`builtins.ts` 구현 규칙(모두 `host(…)`로 만들며 틱은 1):

- `range(끝)`, `range(시작, 끝)`, `range(시작, 끝, 간격)`: 리스트를 만들어 돌려준다. 인자가 정수가 아니면 `Error('range()에는 정수를 넣어야 합니다.')`, 간격이 0이면 `Error('range()의 간격은 0이 될 수 없습니다.')`, 원소가 100,000개를 넘으면 `Error('range()의 범위가 너무 큽니다.')`를 던진다.
- `len(x)`: 리스트, 튜플, 딕셔너리, 문자열의 길이. 그 밖에는 `Error('len()은 리스트, 튜플, 딕셔너리, 문자열에만 사용할 수 있습니다.')`.
- `min`, `max`: 인자가 하나이고 리스트나 튜플이면 그 원소들, 아니면 인자들 가운데에서 고른다. 비어 있으면 `Error('비어 있는 리스트에서는 가장 큰 값이나 작은 값을 구할 수 없습니다.')`, 숫자가 아닌 값이 있으면 `Error('min()과 max()에는 숫자만 넣을 수 있습니다.')`.
- `abs(n)`: 숫자가 아니면 `Error('abs()에는 숫자를 넣어야 합니다.')`.

- [ ] **Step 4: interpreter.ts 구현**

제너레이터로 구현한다. 문장을 시작할 때와 외부 함수를 호출할 때마다 `yield`로 틱 비용을 내보내며, `Program.step`은 예산이 남아 있는 동안 제너레이터를 진행시킨다. 핵심 구조는 다음과 같다.

```ts
import type { Expr, Stmt } from './ast'
import { LangError } from './errors'
import { type Value, type PyFunc, truthy, equals, keyOf, typeName } from './values'

export interface StepResult { status: 'running' | 'done' | 'error'; line: number; error?: LangError }

interface Tick { ticks: number; stmt: boolean }
type Gen<T> = Generator<Tick, T, void>

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal { constructor(public value: Value) {} }

interface Frame { locals: Map<string, Value>; globalNames: Set<string> }

const MAX_DEPTH = 200

export class Program {
  private gen: Gen<void>
  private credit = 0
  private finished: StepResult | null = null
  private frames: Frame[] = []
  line = 0

  constructor(ast: Stmt[], private globals: Map<string, Value>) {
    this.gen = this.runTop(ast)
  }

  step(ticks: number): StepResult {
    if (this.finished) return this.finished
    this.credit = Math.min(this.credit + ticks, ticks)   // 남은 예산을 쌓아 두지 않는다
    while (this.credit > 0) {
      const r = this.advance()
      if (r) return r
    }
    return { status: 'running', line: this.line }
  }

  stepStatement(): StepResult {
    if (this.finished) return this.finished
    this.credit = 0
    let seen = this.atStatementStart ? 1 : 0
    for (;;) {
      const r = this.advance()               // 끝났거나 오류이면 StepResult, 아니면 null
      if (r) return r
      if (this.lastTick.stmt && ++seen >= 2) {
        this.atStatementStart = true
        return { status: 'running', line: this.line }
      }
    }
  }

  // gen.next()를 한 번 호출한다. 받은 틱은 lastTick에 보관하고 credit에서 뺀다.
  private advance(): StepResult | null { … }
}
```

`stepStatement`는 "다음 문장이 시작되기 직전"에 멈춰야 한다. 제너레이터는 문장을 시작할 때 `yield`하므로, 두 번째 문장 시작 표시를 받은 시점에는 첫 번째 문장이 끝난 상태이다. 이미 받은 두 번째 표시는 다음 호출에서 첫 번째 표시로 계산해야 하므로 `atStatementStart` 플래그에 기억한다. `step()`으로 실행을 이어 가면 이 플래그를 `false`로 되돌린다. 마지막 문장을 실행한 호출은 제너레이터가 끝나므로 `done`을 돌려준다. 테스트의 `stepStatement` 경우가 이 동작을 고정한다.

실행 규칙:

- `execBlock(stmts)`은 각 문장에 대해 `this.line = stmt.line`을 정하고 `yield { ticks: 1, stmt: true }`를 한 뒤 실행한다.
- 식 계산 함수 `evalExpr`도 제너레이터이다(식 안에서 사용자 함수를 호출할 수 있기 때문이다). 하위 식은 `yield*`로 계산한다.
- `Call`: 인자를 왼쪽부터 계산한다. 대상이 `HostFunc`이면 인자 개수를 확인하고 `f.call(args)`를 먼저 호출한 다음에 `yield { ticks: f.ticks, stmt: false }`를 한다(동작의 효과가 곧바로 나타나고, 그 뒤에 동작 시간만큼 기다리게 하기 위함이다). 인자 개수가 맞지 않으면 사용자 함수와 외부 함수 모두 `` `${name}()에 넣은 인자의 개수가 맞지 않습니다. (필요: ${필요한 개수}, 넣은 개수: ${args.length})` `` 오류를 낸다. `call`이 던진 `Error`는 `LangError(e.message, 줄, 'runtime')`로 바꾼다. 대상이 `PyFunc`이면 프레임을 쌓고 본문을 실행하며, `ReturnSignal`을 잡아서 값을 돌려준다. 프레임이 `MAX_DEPTH`를 넘으면 `'함수 호출이 너무 깊어졌습니다. 함수가 자기 자신을 끝없이 호출하고 있는지 확인해 주세요.'` 오류를 낸다. 대상이 함수가 아니면 `` `${repr 값}은(는) 함수가 아닙니다.` `` 대신 조사 문제를 피하기 위해 `` `호출하려는 값이 함수가 아닙니다. (${typeName})` ``을 사용한다.
- `Attr` 호출은 `obj.method(args)` 형태만 허용한다. 리스트의 `append`, `pop`(인자 0~1개), `insert`, `remove`를 지원하고, 그 밖의 이름은 `` `'${name}'은(는) 사용할 수 없는 기능입니다.` `` 대신 `` `사용할 수 없는 기능입니다: .${name}()` ``로 안내한다. `remove`에서 값을 찾지 못하면 `'리스트에 그 값이 없습니다.'`, 빈 리스트에서 `pop`을 하면 `'비어 있는 리스트에서는 꺼낼 수 없습니다.'`를 낸다.
- 이름 조회 순서는 현재 프레임의 지역 변수, 전역 변수 순이다(외부 함수와 내장 함수는 전역 Map에 들어 있다). 없으면 `` `'${id}'라는 이름을 찾을 수 없습니다. 철자를 확인하거나 먼저 값을 넣어 주세요.` ``를 낸다.
- 대입: 프레임이 있고 `global`로 선언하지 않은 이름이면 지역 변수에, 아니면 전역 변수에 넣는다. `Def`는 현재 범위에 `PyFunc`를 대입한다.
- 산술: 두 값이 모두 숫자여야 한다. 예외로 `+`는 문자열끼리, 리스트끼리 이어 붙일 수 있다. 맞지 않으면 `` `'${op}' 연산은 숫자끼리만 할 수 있습니다. (${typeName(l)}, ${typeName(r)})` ``를 낸다. `/`, `//`, `%`에서 나누는 값이 0이면 `'0으로 나눌 수 없습니다.'`를 낸다. `//`는 `Math.floor(a / b)`, `%`는 `((a % b) + b) % b`로 계산한다.
- 비교: `==`, `!=`는 `equals`를 사용한다. 크기 비교는 숫자끼리만 허용하고, 아니면 `` `크기 비교는 숫자끼리만 할 수 있습니다. (${typeName(l)}, ${typeName(r)})` ``를 낸다. `in`은 리스트·튜플의 원소, 딕셔너리의 키를 검사한다. 연속 비교는 왼쪽부터 계산하다가 거짓이 나오면 멈춘다.
- 인덱스: 리스트와 튜플은 정수만 허용하고 음수는 뒤에서부터 센다. 범위를 벗어나면 `` `리스트의 범위를 벗어났습니다. (길이 ${n}, 번호 ${i})` ``를 낸다. 딕셔너리에 키가 없으면 `` `딕셔너리에 없는 키입니다: ${repr(key)}` ``를 낸다. 튜플에 대입하면 `'튜플의 값은 바꿀 수 없습니다.'`를 낸다.
- `For`: 반복 대상이 리스트나 튜플이면 원소의 사본을, 딕셔너리면 키의 사본을 순회한다. 그 밖에는 `'for로 반복할 수 없는 값입니다.'`를 낸다. 반복마다 `yield { ticks: 1, stmt: false }`를 한다.
- `While`: 조건을 계산할 때마다 `yield { ticks: 1, stmt: false }`를 한다(본문이 `pass`뿐이어도 틱이 소모되도록 한다).
- 최상위에서 `ReturnSignal`을 잡으면 `'return은 함수 안에서만 사용할 수 있습니다.'`, `BreakSignal`·`ContinueSignal`을 잡으면 `'break와 continue는 반복 안에서만 사용할 수 있습니다.'` 오류로 바꾼다. 함수 본문 밖으로 `BreakSignal`이 나가는 경우도 같은 오류이다.
- `advance()`는 `gen.next()`를 한 번 호출하고 `credit`에서 틱을 뺀다. 제너레이터가 끝나면 `finished = { status: 'done', line }`, `LangError`가 나오면 `finished = { status: 'error', line: e.line, error: e }`로 정하고 돌려준다. `LangError`가 아닌 예외는 그대로 다시 던진다.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/lang`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: 실행기 값과 틱 단위 실행 추가"
```

---

### Task 5: 실행기 — 잠긴 문법 검사와 compile

**Files:**
- Create: `src/lang/checker.ts`, `src/lang/index.ts`
- Test: `tests/lang/compile.test.ts`

**Interfaces:**
- Consumes: `parseSource`, `Program`, `Stmt`, `Expr`, `LangError`, `Value`
- Produces:

```ts
// checker.ts
export type Feature = 'loop' | 'cond' | 'var' | 'func' | 'for' | 'list' | 'dict'
export const ALL_FEATURES: Feature[]
export function check(ast: Stmt[], features: Set<Feature>, featureTitles: Record<Feature, string>, lockedNames: Map<string, string>): void   // 잠긴 것이 있으면 LangError('locked')를 던진다

// index.ts
export interface CompileOptions {
  features: Set<Feature>
  featureTitles: Record<Feature, string>   // 문법 → 해금 항목 이름
  globals: Map<string, Value>
  lockedNames: Map<string, string>         // 잠긴 함수 이름 → 해금 항목 이름
}
export type CompileResult = { ok: true; program: Program } | { ok: false; error: LangError }
export function compile(source: string, opts: CompileOptions): CompileResult
export { LangError, Program }
export type { StepResult, Value, Feature }
```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lang/compile.test.ts`:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/lang/compile.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현**

`checker.ts`는 구문 트리를 순회하면서 노드마다 필요한 문법을 판정한다.

| 노드 | 필요한 문법 | 안내에 쓰는 표기 |
|---|---|---|
| `While`, `Break`, `Continue` | `loop` | `while`, `break`, `continue` |
| `If`, `Cmp`, `Bool`, `Unary(not)`, `Const(None)` | `cond` | `if`, `비교 연산`, `and/or`, `not`, `None` |
| `Assign`, `Aug`, `Bin`, `Unary(-)` | `var` | `변수 대입`, `계산식` |
| `Def`, `Return`, `Global` | `func` | `def`, `return`, `global` |
| `For` | `for` | `for` |
| `List`, `Tuple`, `Index`, `Attr` | `list` | `리스트` |
| `Dict` | `dict` | `딕셔너리` |

- 한 노드에서 여러 문법이 걸리면 위에서 아래 순서(바깥 문장 → 안쪽 식, 줄 번호가 빠른 것)로 처음 만난 것을 보고한다. 문장은 그 문장 자체의 문법을 먼저 검사하고 나서 하위 식과 본문을 검사한다.
- 오류 문구: `` `아직 해금하지 않은 문법입니다: ${표기}. 해금 화면에서 '${title}' 항목을 해금하면 사용할 수 있습니다.` ``
- 잠긴 이름: `Name` 노드의 `id`가 `lockedNames`에 있고, 프로그램 전체에서 그 이름에 대입(`Assign`의 대상, `Def`의 이름, `For`의 변수, 함수 매개변수)한 적이 없을 때에만 보고한다. 문구: `` `아직 해금하지 않은 기능입니다: ${id}. 해금 화면에서 '${title}' 항목을 해금하면 사용할 수 있습니다.` ``
- `True`와 `False`는 항상 허용한다.

`index.ts`:

```ts
import { parseSource } from './parser'
import { check, type Feature } from './checker'
import { Program, type StepResult } from './interpreter'
import { LangError } from './errors'
import type { Value } from './values'

export interface CompileOptions {
  features: Set<Feature>
  featureTitles: Record<Feature, string>
  globals: Map<string, Value>
  lockedNames: Map<string, string>
}
export type CompileResult = { ok: true; program: Program } | { ok: false; error: LangError }

export function compile(source: string, opts: CompileOptions): CompileResult {
  try {
    const ast = parseSource(source)
    check(ast, opts.features, opts.featureTitles, opts.lockedNames)
    return { ok: true, program: new Program(ast, new Map(opts.globals)) }
  } catch (e) {
    if (e instanceof LangError) return { ok: false, error: e }
    throw e
  }
}

export { LangError, Program }
export type { StepResult, Value, Feature }
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/lang && npx tsc --noEmit`
Expected: PASS, 타입 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 잠긴 문법 검사와 compile 추가"
```

---

### Task 6: 온실 — 기본 동작

**Files:**
- Create: `src/sim/types.ts`, `src/sim/balance.ts`, `src/sim/rng.ts`, `src/sim/world.ts`
- Test: `tests/sim/world.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export type PlantKind = 'Daisy' | 'Strawberry' | 'Tulip' | 'Sunflower' | 'Tomato' | 'Crate'
export type ItemKind = PlantKind | 'Power' | 'Coin' | 'Water'
export type Dir = 'Right' | 'Left' | 'Up' | 'Down'
export const PLANT_KINDS: PlantKind[]
export const ITEM_KINDS: ItemKind[]
export interface Cell {
  plant: PlantKind | null
  growth: number        // 0~1, 1이면 다 자람
  water: number         // 0~1
  wilted: boolean       // 시든 토마토
  value: number         // 해바라기의 꽃잎 수 또는 상자의 무게, 그 밖에는 0
}
export interface WorldState {
  w: number; h: number; cells: Cell[]       // cells[y * w + x], (0,0)은 왼쪽 아래
  droneX: number; droneY: number
  items: Record<ItemKind, number>
  waterCap: number; waterTimerMs: number
  powerActions: number
  yieldMult: { Daisy: number; Strawberry: number; Tulip: number }
  rng: number; timeMs: number
}
export type WorldEvent =
  | { type: 'move'; fromX: number; fromY: number; x: number; y: number; wrapped: boolean }
  | { type: 'harvest'; x: number; y: number; item: ItemKind; amount: number; cells: { x: number; y: number }[] }
  | { type: 'plant'; x: number; y: number; kind: PlantKind }
  | { type: 'water'; x: number; y: number }
  | { type: 'swap'; x: number; y: number; dir: Dir }
  | { type: 'wilt'; x: number; y: number }
  | { type: 'fail'; x: number; y: number }

// balance.ts
export const GROW_MS: Record<PlantKind, number>
export const PLANT_COST: Record<PlantKind, Partial<Record<ItemKind, number>>>
export const BASE_YIELD: { Daisy: number; Strawberry: number; Tulip: number }
export const WATER_PER_USE = 0.25
export const WATER_FILL_MS = 10000
export const WATER_DECAY_PER_SEC = 0.01
export const WILT_CHANCE = 0.2
export const POWER_ACTIONS_PER_UNIT = 30

// rng.ts
export function nextRandom(state: number): { state: number; value: number }   // value는 0 이상 1 미만

// world.ts
export class World {
  state: WorldState
  constructor(state: WorldState)
  static create(seed: number): World       // 1×1, 다 자란 데이지 하나
  cellAt(x: number, y: number): Cell
  resize(w: number, h: number): void
  advance(ms: number): void
  move(dir: Dir): boolean
  harvest(): boolean
  plant(kind: PlantKind): boolean
  water(): boolean
  swap(dir: Dir): boolean                  // Task 7에서 구현
  canHarvest(): boolean
  plantType(): PlantKind | null
  getWater(): number
  measure(dir?: Dir): number | null        // Task 7에서 구현
  takeEvents(): WorldEvent[]               // 쌓인 이벤트를 돌려주고 비운다
}
```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/sim/world.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { World } from '../../src/sim/world'
import { GROW_MS } from '../../src/sim/balance'

const world = (w = 3, h = 3) => {
  const wd = World.create(1)
  wd.resize(w, h)
  return wd
}
const grow = (wd: World) => wd.advance(60000)

describe('시작 상태와 크기', () => {
  test('1×1 선반에 다 자란 데이지 하나로 시작한다', () => {
    const wd = World.create(1)
    expect([wd.state.w, wd.state.h]).toEqual([1, 1])
    expect(wd.plantType()).toBe('Daisy')
    expect(wd.canHarvest()).toBe(true)
  })

  test('선반을 넓혀도 기존 화분과 드론 위치가 유지된다', () => {
    const wd = World.create(1)
    wd.resize(3, 1)
    expect(wd.cellAt(0, 0).plant).toBe('Daisy')
    expect(wd.cellAt(2, 0).plant).toBeNull()
    wd.move('Right')
    wd.resize(3, 3)
    expect([wd.state.droneX, wd.state.droneY]).toEqual([1, 0])
    expect(wd.cellAt(0, 0).plant).toBe('Daisy')
  })
})

describe('이동', () => {
  test('네 방향으로 이동한다', () => {
    const wd = world()
    wd.move('Right'); wd.move('Up')
    expect([wd.state.droneX, wd.state.droneY]).toEqual([1, 1])
    wd.move('Left'); wd.move('Down')
    expect([wd.state.droneX, wd.state.droneY]).toEqual([0, 0])
  })

  test('선반 끝을 넘어가면 반대편으로 이어진다', () => {
    const wd = world()
    wd.move('Left')
    expect(wd.state.droneX).toBe(2)
    wd.move('Down')
    expect(wd.state.droneY).toBe(2)
    const ev = wd.takeEvents().filter(e => e.type === 'move')
    expect(ev.every(e => e.type === 'move' && e.wrapped)).toBe(true)
  })

  test('세로가 1칸이면 위로 이동해도 같은 칸이다', () => {
    const wd = world(3, 1)
    wd.move('Up')
    expect(wd.state.droneY).toBe(0)
  })
})

describe('데이지', () => {
  test('수확하면 데이지 1을 얻고, 빈 화분에는 데이지가 다시 핀다', () => {
    const wd = World.create(1)
    expect(wd.harvest()).toBe(true)
    expect(wd.state.items.Daisy).toBe(1)
    wd.advance(100)
    expect(wd.plantType()).toBe('Daisy')
    expect(wd.canHarvest()).toBe(false)
    wd.advance(GROW_MS.Daisy)
    expect(wd.canHarvest()).toBe(true)
  })

  test('다 자라지 않은 데이지는 수확되지 않고 남는다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.advance(100)
    expect(wd.harvest()).toBe(false)
    expect(wd.plantType()).toBe('Daisy')
    expect(wd.state.items.Daisy).toBe(1)
  })
})

describe('심기', () => {
  test('딸기를 심으면 데이지 1을 쓰고, 다 자라면 딸기 1을 얻는다', () => {
    const wd = World.create(1)
    wd.harvest()
    expect(wd.plant('Strawberry')).toBe(true)
    expect(wd.state.items.Daisy).toBe(0)
    expect(wd.canHarvest()).toBe(false)
    wd.advance(GROW_MS.Strawberry)
    expect(wd.canHarvest()).toBe(true)
    expect(wd.harvest()).toBe(true)
    expect(wd.state.items.Strawberry).toBe(1)
  })

  test('비용이 부족하면 심지 못한다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.plant('Strawberry')
    wd.harvest()                       // 덜 자란 딸기를 뽑는다
    expect(wd.plantType()).toBeNull()
    expect(wd.plant('Strawberry')).toBe(false)
  })

  test('자라고 있는 데이지 자리에는 다른 작물을 심을 수 있다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.advance(100)                    // 데이지가 다시 피어 자라는 중
    expect(wd.plant('Strawberry')).toBe(true)
    expect(wd.plantType()).toBe('Strawberry')
  })

  test('다른 작물이 있는 칸에는 심지 못한다', () => {
    const wd = World.create(1)
    wd.state.items.Daisy = 10
    wd.harvest()
    wd.plant('Strawberry')
    expect(wd.plant('Strawberry')).toBe(false)
    expect(wd.state.items.Daisy).toBe(10)
  })

  test('다 자라지 않은 딸기를 수확하면 작물만 사라진다', () => {
    const wd = World.create(1)
    wd.harvest()
    wd.plant('Strawberry')
    wd.advance(1000)
    expect(wd.harvest()).toBe(false)
    expect(wd.plantType()).toBeNull()
    expect(wd.state.items.Strawberry).toBe(0)
  })

  test('수확량 배율이 적용된다', () => {
    const wd = World.create(1)
    wd.state.yieldMult.Daisy = 2
    wd.harvest()
    expect(wd.state.items.Daisy).toBe(2)
  })
})

describe('물', () => {
  test('물탱크는 10초마다 1씩 차고 최대 저장량을 넘지 않는다', () => {
    const wd = World.create(1)
    wd.advance(60000)
    expect(wd.state.items.Water).toBe(0)       // 물주기를 해금하기 전에는 저장량이 0이다
    wd.state.waterCap = 3
    wd.advance(25000)
    expect(wd.state.items.Water).toBe(2)
    wd.advance(60000)
    expect(wd.state.items.Water).toBe(3)
  })

  test('물을 주면 수분이 0.25 오르고 1을 넘지 않는다', () => {
    const wd = World.create(1)
    wd.state.items.Water = 6
    expect(wd.water()).toBe(true)
    expect(wd.getWater()).toBeCloseTo(0.25)
    for (let i = 0; i < 5; i++) wd.water()
    expect(wd.getWater()).toBe(1)
    expect(wd.state.items.Water).toBe(0)
    expect(wd.water()).toBe(false)
  })

  test('수분은 시간이 지나면 줄어든다', () => {
    const wd = World.create(1)
    wd.state.items.Water = 4
    for (let i = 0; i < 4; i++) wd.water()
    wd.advance(10000)
    expect(wd.getWater()).toBeGreaterThan(0.85)
    expect(wd.getWater()).toBeLessThan(0.95)
  })

  test('수분이 가득하면 약 5배 빨리 자란다', () => {
    const wd = World.create(1)
    wd.state.items.Water = 4
    wd.harvest()
    wd.plant('Strawberry')
    for (let i = 0; i < 4; i++) wd.water()
    wd.advance(GROW_MS.Strawberry / 4)
    expect(wd.canHarvest()).toBe(true)
  })
})

describe('이벤트와 결정성', () => {
  test('동작마다 이벤트를 남기고 takeEvents로 비운다', () => {
    const wd = world()
    wd.harvest(); wd.move('Right')
    const types = wd.takeEvents().map(e => e.type)
    expect(types).toEqual(['harvest', 'move'])
    expect(wd.takeEvents()).toEqual([])
  })

  test('같은 시드와 같은 입력은 같은 상태를 만든다', () => {
    const play = () => {
      const wd = world()
      for (let i = 0; i < 50; i++) { wd.harvest(); wd.plant('Strawberry'); wd.move('Right'); wd.advance(700) }
      return JSON.stringify(wd.state)
    }
    expect(play()).toBe(play())
  })

  test('큰 시간을 한 번에 진행해도 나누어 진행한 것과 결과가 같다', () => {
    const a = world(); const b = world()
    a.state.items.Water = 2; b.state.items.Water = 2
    a.water(); b.water()
    a.advance(5000)
    for (let i = 0; i < 50; i++) b.advance(100)
    expect(a.getWater()).toBeCloseTo(b.getWater(), 6)
    grow(a); grow(b)
    expect(a.canHarvest()).toBe(b.canHarvest())
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/sim/world.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현**

`src/sim/balance.ts`:

```ts
import type { ItemKind, PlantKind } from './types'

// 초기값이다. Task 11의 균형 테스트 결과에 따라 조정한다.
export const GROW_MS: Record<PlantKind, number> = {
  Daisy: 2000, Strawberry: 6000, Tulip: 8000, Sunflower: 6000, Tomato: 4000, Crate: 0,
}
export const PLANT_COST: Record<PlantKind, Partial<Record<ItemKind, number>>> = {
  Daisy: {}, Strawberry: { Daisy: 1 }, Tulip: { Daisy: 2 }, Sunflower: { Strawberry: 1 },
  Tomato: { Tulip: 1 }, Crate: { Tomato: 1 },
}
export const BASE_YIELD = { Daisy: 1, Strawberry: 1, Tulip: 3 }
export const WATER_PER_USE = 0.25
export const WATER_FILL_MS = 10000
export const WATER_DECAY_PER_SEC = 0.01
export const WILT_CHANCE = 0.2
export const POWER_ACTIONS_PER_UNIT = 30
export const SUNFLOWER_MIN_COUNT = 10
export const SUNFLOWER_BONUS = 8
```

`src/sim/rng.ts` (mulberry32):

```ts
export function nextRandom(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
```

`src/sim/world.ts` 구현 규칙:

- `World.create(seed)`: `w = h = 1`, 칸 하나에 `{ plant: 'Daisy', growth: 1, water: 0, wilted: false, value: 0 }`, 모든 `items`는 0, `waterCap`은 0, `yieldMult`는 모두 1, `rng`는 `seed`.
- `resize(w, h)`: 새 배열을 만들고 기존 칸을 같은 좌표에 옮긴다. 새 칸은 빈 칸(`plant: null`)이다. 드론 좌표는 그대로 둔다(크기는 늘어나기만 한다).
- `advance(ms)`: 최대 100ms 단위로 잘라 반복하며, 단위마다 다음을 순서대로 처리한다.
  1. `timeMs`를 더한다.
  2. `waterCap > 0`이면 `waterTimerMs`를 더하고, `WATER_FILL_MS`를 넘을 때마다 물을 1 채운다(`waterCap`까지). `waterCap`이 0이면 타이머를 진행하지 않는다.
  3. 칸마다: 빈 칸이면 `plant: 'Daisy', growth: 0`으로 바꾼다. 작물이 있고 `growth < 1`이며 시들지 않았으면 `growth += dt / (GROW_MS[plant] * tulipFactor) * (1 + 4 * water)`로 늘리고 1로 제한한다. `tulipFactor`는 이 Task에서는 1이며 Task 7에서 추가한다. 그다음에 `water *= (1 - WATER_DECAY_PER_SEC) ** (dt / 1000)`으로 줄인다.
- 동작 메서드(`move`, `harvest`, `plant`, `water`, `swap`)는 시작할 때 `useAction()`을 호출한다. `useAction()`은 `items.Power > 0`이면 `powerActions`를 1 늘리고, `POWER_ACTIONS_PER_UNIT`에 도달하면 전력 1을 줄이고 0으로 되돌린다.
- `move(dir)`: 좌표를 옮기고 범위를 벗어나면 반대편으로 보낸다. `move` 이벤트의 `wrapped`는 반대편으로 넘어갔거나 제자리로 돌아온 경우에 `true`이다. 항상 `true`를 돌려준다.
- `harvest()`:
  - 작물이 없거나 시든 토마토이면 `fail` 이벤트를 남기고 `false`를 돌려준다.
  - 데이지가 덜 자랐으면 `fail` 이벤트를 남기고 `false`를 돌려준다(작물은 남는다).
  - 그 밖의 작물이 덜 자랐으면 칸을 비우고 `fail` 이벤트를 남기고 `false`를 돌려준다.
  - 다 자란 데이지·딸기·튤립은 `BASE_YIELD × yieldMult`만큼 자원을 더하고 칸을 비운 다음, `harvest` 이벤트(`cells`는 그 칸 하나)를 남기고 `true`를 돌려준다.
  - 해바라기·토마토·상자의 다 자란 경우는 Task 7에서 구현한다. 이 Task에서는 각각 전력 1, 토마토 1, 코인 1을 주고 칸을 비운다.
  - 칸을 비울 때 `water`는 유지하고 `growth`, `wilted`, `value`는 초기화한다.
- `plant(kind)`: 칸이 비어 있거나, 데이지가 있거나(자란 정도와 무관, 단 `kind`가 데이지가 아닐 때), 시든 토마토가 있을 때에만 심을 수 있다. `PLANT_COST`를 낼 수 없으면 실패한다. 실패하면 `fail` 이벤트와 `false`, 성공하면 비용을 차감하고 `growth`는 `GROW_MS[kind] === 0`이면 1, 아니면 0으로 정한 다음 `plant` 이벤트와 `true`를 돌려준다. 해바라기와 상자의 `value`는 Task 7에서 정한다.
- `water()`: `items.Water < 1`이면 실패한다. 성공하면 물 1을 쓰고 `water = min(1, water + WATER_PER_USE)`로 올린다.
- `canHarvest()`: 작물이 있고 `growth >= 1`이며 시들지 않았으면 `true`이다.
- `swap`과 `measure`는 이 Task에서는 각각 `false`와 `null`을 돌려주는 형태로 둔다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/sim`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 온실 시뮬레이션 기본 동작 추가"
```

---

### Task 7: 온실 — 작물별 특수 규칙

**Files:**
- Create: `src/sim/rules.ts`
- Modify: `src/sim/world.ts`
- Test: `tests/sim/rules.test.ts`

**Interfaces:**
- Consumes: `World`, `WorldState`, `Cell`, `nextRandom`, balance 상수
- Produces:

```ts
// rules.ts — 모두 순수 함수이며, 이웃 판정에서 선반 끝은 반대편으로 이어지지 않는다.
export function tulipNeighbors(s: WorldState, x: number, y: number): number
export function largestRipeSquare(s: WorldState, x: number, y: number): { x: number; y: number; n: number } | null   // (x, y)를 포함하는 가장 큰 익은 토마토 정사각형의 왼쪽 아래 좌표와 한 변
export function isCrateSorted(s: WorldState, x: number, y: number): boolean
export function sortedCrateGroup(s: WorldState, x: number, y: number): { x: number; y: number }[]
```

`World`에는 `swap(dir)`, `measure(dir?)`의 실제 동작과 해바라기·토마토·상자의 수확 규칙이 추가된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/sim/rules.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { World } from '../../src/sim/world'
import { GROW_MS } from '../../src/sim/balance'
import type { PlantKind } from '../../src/sim/types'

const world = (n: number, seed = 1) => {
  const wd = World.create(seed)
  wd.resize(n, n)
  for (const k of ['Daisy', 'Strawberry', 'Tulip', 'Tomato'] as const) wd.state.items[k] = 10000
  return wd
}
const put = (wd: World, x: number, y: number, plant: PlantKind, value = 0, growth = 1) => {
  Object.assign(wd.cellAt(x, y), { plant, growth, value, wilted: false })
}
const goto = (wd: World, x: number, y: number) => { wd.state.droneX = x; wd.state.droneY = y }

describe('튤립', () => {
  test('이웃에 튤립이 하나 있을 때마다 성장 시간이 2배가 된다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Tulip', 0, 0)          // 이웃 없음
    put(wd, 2, 2, 'Tulip', 0, 0)          // 이웃 하나
    put(wd, 2, 1, 'Tulip', 0, 0)
    wd.advance(GROW_MS.Tulip)
    expect(wd.cellAt(0, 0).growth).toBe(1)
    expect(wd.cellAt(2, 2).growth).toBeCloseTo(0.5, 1)
  })

  test('대각선과 선반 반대편은 이웃이 아니다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Tulip', 0, 0)
    put(wd, 1, 1, 'Tulip', 0, 0)
    put(wd, 2, 0, 'Tulip', 0, 0)
    wd.advance(GROW_MS.Tulip)
    expect(wd.cellAt(0, 0).growth).toBe(1)
  })

  test('수확하면 튤립 3을 얻는다', () => {
    const wd = world(1)
    wd.state.items.Tulip = 0
    put(wd, 0, 0, 'Tulip')
    wd.harvest()
    expect(wd.state.items.Tulip).toBe(3)
  })
})

describe('해바라기', () => {
  test('심으면 꽃잎 수가 7에서 15 사이로 정해지고 measure로 잴 수 있다', () => {
    const wd = world(4)
    const seen = new Set<number>()
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      goto(wd, x, y); wd.harvest(); wd.plant('Sunflower')
      const m = wd.measure()!
      expect(m).toBeGreaterThanOrEqual(7)
      expect(m).toBeLessThanOrEqual(15)
      seen.add(m)
    }
    expect(seen.size).toBeGreaterThan(2)
  })

  test('다 자란 해바라기가 10송이 이상일 때 꽃잎이 가장 많은 것을 수확하면 전력 8을 얻는다', () => {
    const wd = world(4)
    for (let i = 0; i < 10; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 7 + (i % 5))
    put(wd, 3, 3, 'Sunflower', 15)
    goto(wd, 3, 3)
    wd.harvest()
    expect(wd.state.items.Power).toBe(8)
  })

  test('가장 많은 것이 아니면 전력 1을 얻는다', () => {
    const wd = world(4)
    for (let i = 0; i < 11; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 7 + i % 3)
    put(wd, 3, 3, 'Sunflower', 15)
    goto(wd, 0, 0)
    wd.harvest()
    expect(wd.state.items.Power).toBe(1)
  })

  test('10송이 미만이면 가장 많은 것을 수확해도 전력 1을 얻는다', () => {
    const wd = world(4)
    for (let i = 0; i < 5; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 9)
    goto(wd, 0, 0)
    wd.harvest()
    expect(wd.state.items.Power).toBe(1)
  })

  test('꽃잎 수가 같은 것이 여럿이면 모두 가장 많은 것으로 본다', () => {
    const wd = world(4)
    for (let i = 0; i < 12; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 12)
    goto(wd, 1, 1)
    wd.harvest()
    expect(wd.state.items.Power).toBe(8)
  })

  test('덜 자란 해바라기는 10송이에 세지 않는다', () => {
    const wd = world(4)
    for (let i = 0; i < 9; i++) put(wd, i % 4, Math.floor(i / 4), 'Sunflower', 9)
    put(wd, 3, 3, 'Sunflower', 9, 0.5)
    goto(wd, 0, 0)
    wd.harvest()
    expect(wd.state.items.Power).toBe(1)
  })
})

describe('전력', () => {
  test('동작을 30번 할 때마다 전력 1을 쓴다', () => {
    const wd = world(3)
    wd.state.items.Power = 2
    for (let i = 0; i < 29; i++) wd.move('Right')
    expect(wd.state.items.Power).toBe(2)
    wd.move('Right')
    expect(wd.state.items.Power).toBe(1)
  })
})

describe('토마토', () => {
  test('다 자라는 순간 약 20%가 시든다', () => {
    const wd = world(6, 7)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) put(wd, x, y, 'Tomato', 0, 0)
    let wilted = 0, total = 0
    for (let round = 0; round < 20; round++) {
      wd.advance(GROW_MS.Tomato + 100)
      for (const c of wd.state.cells) { total++; if (c.wilted) wilted++; Object.assign(c, { growth: 0, wilted: false }) }
    }
    expect(wilted / total).toBeGreaterThan(0.12)
    expect(wilted / total).toBeLessThan(0.28)
  })

  test('시든 토마토는 수확할 수 없고, 다시 심으면 교체된다', () => {
    const wd = world(1)
    put(wd, 0, 0, 'Tomato')
    wd.cellAt(0, 0).wilted = true
    expect(wd.canHarvest()).toBe(false)
    expect(wd.harvest()).toBe(false)
    expect(wd.plantType()).toBe('Tomato')
    expect(wd.plant('Tomato')).toBe(true)
    expect(wd.cellAt(0, 0).wilted).toBe(false)
    expect(wd.cellAt(0, 0).growth).toBe(0)
  })

  test('시든 토마토 자리에는 다른 작물도 심을 수 있다', () => {
    const wd = world(1)
    put(wd, 0, 0, 'Tomato')
    wd.cellAt(0, 0).wilted = true
    expect(wd.plant('Crate')).toBe(true)
    expect(wd.plantType()).toBe('Crate')
    expect(wd.cellAt(0, 0).wilted).toBe(false)
  })

  test('익은 토마토 하나는 토마토 1을 준다', () => {
    const wd = world(3)
    wd.state.items.Tomato = 0
    put(wd, 1, 1, 'Tomato')
    goto(wd, 1, 1)
    wd.harvest()
    expect(wd.state.items.Tomato).toBe(1)
  })

  test('n×n 정사각형은 한꺼번에 수확되고 n³을 준다', () => {
    const wd = world(4)
    wd.state.items.Tomato = 0
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(wd, x, y, 'Tomato')
    goto(wd, 2, 2)
    wd.harvest()
    expect(wd.state.items.Tomato).toBe(27)
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) expect(wd.cellAt(x, y).plant).toBeNull()
  })

  test('시든 토마토나 덜 익은 토마토가 끼어 있으면 그 칸을 제외한 가장 큰 정사각형만 수확한다', () => {
    const wd = world(3)
    wd.state.items.Tomato = 0
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(wd, x, y, 'Tomato')
    wd.cellAt(2, 2).wilted = true
    goto(wd, 0, 0)
    wd.harvest()
    expect(wd.state.items.Tomato).toBe(8)
    expect(wd.cellAt(2, 0).plant).toBe('Tomato')
  })

  test('6×6이면 216을 준다', () => {
    const wd = world(6)
    wd.state.items.Tomato = 0
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) put(wd, x, y, 'Tomato')
    wd.harvest()
    expect(wd.state.items.Tomato).toBe(216)
  })
})

describe('과일 상자', () => {
  test('놓으면 곧바로 수확할 수 있고 무게는 0에서 9 사이이다', () => {
    const wd = world(3)
    wd.harvest()
    expect(wd.plant('Crate')).toBe(true)
    expect(wd.canHarvest()).toBe(true)
    expect(wd.measure()).toBeGreaterThanOrEqual(0)
    expect(wd.measure()).toBeLessThanOrEqual(9)
  })

  test('measure에 방향을 주면 이웃 칸을 잰다. 상자나 해바라기가 아니면 None이다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 4)
    put(wd, 1, 0, 'Crate', 7)
    expect(wd.measure('Right')).toBe(7)
    expect(wd.measure('Up')).toBeNull()
  })

  test('swap은 이웃 칸과 내용물을 바꾸고, 선반 끝에서는 실패한다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 9)
    put(wd, 1, 0, 'Crate', 2)
    expect(wd.swap('Right')).toBe(true)
    expect(wd.measure()).toBe(2)
    expect(wd.measure('Right')).toBe(9)
    expect(wd.swap('Left')).toBe(false)
  })

  test('정리되지 않은 상자를 수확하면 그 상자만 출하되고 코인 1을 얻는다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 9)
    put(wd, 1, 0, 'Crate', 2)
    wd.harvest()
    expect(wd.state.items.Coin).toBe(1)
    expect(wd.cellAt(1, 0).plant).toBe('Crate')
  })

  test('정리된 상자를 수확하면 연결된 정리된 상자가 모두 출하되고 개수의 제곱만큼 코인을 얻는다', () => {
    const wd = world(3)
    const weights = [[1, 2, 3], [2, 3, 4], [3, 4, 9]]      // weights[y][x]
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(wd, x, y, 'Crate', weights[y][x])
    goto(wd, 1, 1)
    wd.harvest()
    expect(wd.state.items.Coin).toBe(81)
    expect(wd.state.cells.every(c => c.plant === null)).toBe(true)
  })

  test('무게가 같은 이웃은 정리된 것으로 본다', () => {
    const wd = world(2)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) put(wd, x, y, 'Crate', 5)
    wd.harvest()
    expect(wd.state.items.Coin).toBe(16)
  })

  test('정리되지 않은 상자는 묶음에 포함되지 않는다', () => {
    const wd = world(3)
    put(wd, 0, 0, 'Crate', 1); put(wd, 1, 0, 'Crate', 2); put(wd, 2, 0, 'Crate', 0)
    goto(wd, 0, 0)
    wd.harvest()
    // (1,0)은 오른쪽 이웃이 더 가벼워서 정리되지 않았다. (0,0)만 출하된다.
    expect(wd.state.items.Coin).toBe(1)
    expect(wd.cellAt(1, 0).plant).toBe('Crate')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/sim/rules.test.ts`
Expected: FAIL.

- [ ] **Step 3: rules.ts 구현**

```ts
import type { WorldState, Cell } from './types'

const at = (s: WorldState, x: number, y: number): Cell | null =>
  x < 0 || y < 0 || x >= s.w || y >= s.h ? null : s.cells[y * s.w + x]

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

export function tulipNeighbors(s: WorldState, x: number, y: number): number {
  let n = 0
  for (const [dx, dy] of NEIGHBORS) if (at(s, x + dx, y + dy)?.plant === 'Tulip') n++
  return n
}

const ripeTomato = (c: Cell | null) => !!c && c.plant === 'Tomato' && c.growth >= 1 && !c.wilted

export function largestRipeSquare(s: WorldState, x: number, y: number): { x: number; y: number; n: number } | null {
  if (!ripeTomato(at(s, x, y))) return null
  const max = Math.min(s.w, s.h, 6)
  for (let n = max; n >= 1; n--) {
    for (let oy = y - n + 1; oy <= y; oy++) {
      for (let ox = x - n + 1; ox <= x; ox++) {
        let ok = true
        for (let j = 0; j < n && ok; j++) for (let i = 0; i < n && ok; i++) ok = ripeTomato(at(s, ox + i, oy + j))
        if (ok) return { x: ox, y: oy, n }
      }
    }
  }
  return null
}

export function isCrateSorted(s: WorldState, x: number, y: number): boolean {
  const c = at(s, x, y)
  if (!c || c.plant !== 'Crate') return false
  const heavier = [at(s, x + 1, y), at(s, x, y + 1)]
  const lighter = [at(s, x - 1, y), at(s, x, y - 1)]
  return heavier.every(n => !n || n.plant !== 'Crate' || n.value >= c.value)
    && lighter.every(n => !n || n.plant !== 'Crate' || n.value <= c.value)
}

export function sortedCrateGroup(s: WorldState, x: number, y: number): { x: number; y: number }[] {
  if (!isCrateSorted(s, x, y)) return []
  const seen = new Set<number>([y * s.w + x])
  const queue = [{ x, y }]
  for (let i = 0; i < queue.length; i++) {
    for (const [dx, dy] of NEIGHBORS) {
      const nx = queue[i].x + dx, ny = queue[i].y + dy
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h || seen.has(ny * s.w + nx)) continue
      if (!isCrateSorted(s, nx, ny)) continue
      seen.add(ny * s.w + nx)
      queue.push({ x: nx, y: ny })
    }
  }
  return queue
}
```

- [ ] **Step 4: world.ts에 규칙 연결**

- `advance`: 튤립의 성장 시간에 `2 ** tulipNeighbors(state, x, y)`를 곱한다. 토마토의 `growth`가 이번 단위에서 1에 도달하면 `nextRandom`으로 난수를 뽑아 `WILT_CHANCE`보다 작으면 `wilted = true`로 정하고 `wilt` 이벤트를 남긴다.
- `plant`: 해바라기는 `value = 7 + floor(난수 × 9)`, 상자는 `value = floor(난수 × 10)`으로 정한다.
- `harvest`:
  - 해바라기: 선반에서 `growth >= 1`인 해바라기를 모은다. 그 수가 `SUNFLOWER_MIN_COUNT` 이상이고 현재 칸의 `value`가 그중 최댓값과 같으면 전력 `SUNFLOWER_BONUS`, 아니면 전력 1을 얻는다.
  - 토마토: `largestRipeSquare`가 돌려준 정사각형의 모든 칸을 비우고 토마토 `n ** 3`을 얻는다. `harvest` 이벤트의 `cells`에 비운 칸을 모두 넣는다.
  - 상자: `sortedCrateGroup`이 비어 있지 않으면 그 칸들을 모두 비우고 코인 `개수 ** 2`를 얻는다. 비어 있으면 현재 칸만 비우고 코인 1을 얻는다.
- `swap(dir)`: 이웃 좌표가 선반 밖이면(반대편으로 이어지지 않는다) `fail` 이벤트와 `false`를 돌려준다. 아니면 두 칸의 `plant`, `growth`, `wilted`, `value`를 서로 바꾸고(`water`는 칸에 남긴다) `swap` 이벤트와 `true`를 돌려준다.
- `measure(dir?)`: 방향이 없으면 현재 칸, 있으면 이웃 칸(선반 밖이면 `null`)을 본다. 그 칸이 해바라기나 상자이면 `value`, 아니면 `null`을 돌려준다.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/sim`
Expected: PASS (Task 6의 테스트도 계속 통과).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: 튤립, 해바라기, 토마토, 과일 상자 규칙 추가"
```

---

### Task 8: 진행 — 해금 정의와 드론 함수 연결

**Files:**
- Create: `src/progress/unlocks.ts`, `src/progress/droneApi.ts`
- Test: `tests/progress/unlocks.test.ts`, `tests/progress/droneApi.test.ts`

**Interfaces:**
- Consumes: `World`, `ItemKind`, `PlantKind`, `Feature`, `host`, `constant`, `builtins`, `Value`
- Produces:

```ts
// unlocks.ts
export type UnlockId =
  | 'loop' | 'speed1' | 'expand1' | 'cond' | 'strawberry' | 'expand2' | 'watering' | 'var' | 'func'
  | 'tulip' | 'for' | 'expand3' | 'speed2' | 'sunflower' | 'list' | 'tomato' | 'expand4' | 'dict'
  | 'crate' | 'yieldDaisy' | 'yieldStrawberry' | 'yieldTulip' | 'automation'
export interface UnlockDef {
  id: UnlockId
  title: string                              // 해금 항목 이름
  summary: string                            // 해금 화면에 보이는 한 줄 설명(합니다체)
  cost: Partial<Record<ItemKind, number>>
  requires: UnlockId[]
  features: Feature[]
  names: string[]                            // 이 항목이 여는 함수 이름
  plants: PlantKind[]                        // 이 항목이 여는 작물
  size?: { w: number; h: number }
  speed?: number                             // 드론 속도 배율(가장 큰 값이 적용된다)
  waterCap?: number
  yieldMult?: 'Daisy' | 'Strawberry' | 'Tulip'
}
export const UNLOCKS: UnlockDef[]            // 설계 문서 5절의 순서대로
export const UNLOCK_ORDER: UnlockId[]
export function unlockDef(id: UnlockId): UnlockDef
export function canBuy(unlocked: Set<UnlockId>, items: Record<ItemKind, number>, id: UnlockId): boolean
export function featureTitles(): Record<Feature, string>
export function unlockedFeatures(unlocked: Set<UnlockId>): Set<Feature>
export function unlockedPlants(unlocked: Set<UnlockId>): Set<PlantKind>   // 데이지는 항상 포함
export function speedMultiplier(unlocked: Set<UnlockId>): number          // 기본 1

// droneApi.ts
export interface DroneApi { globals: Map<string, Value>; lockedNames: Map<string, string> }
export function buildDroneApi(world: World, unlocked: Set<UnlockId>, print: (text: string) => void): DroneApi
export const PLANT_LABEL: Record<PlantKind, string>    // '데이지', '딸기', '튤립', '해바라기', '토마토', '과일 상자'
export const ITEM_LABEL: Record<ItemKind, string>      // 위에 더해 '전력', '코인', '물'
```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/progress/unlocks.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { UNLOCKS, UNLOCK_ORDER, canBuy, featureTitles, speedMultiplier, unlockDef, unlockedFeatures, unlockedPlants, type UnlockId } from '../../src/progress/unlocks'
import { ALL_FEATURES } from '../../src/lang/checker'
import { ITEM_KINDS, type ItemKind } from '../../src/sim/types'

const items = (over: Partial<Record<ItemKind, number>> = {}) =>
  Object.assign(Object.fromEntries(ITEM_KINDS.map(k => [k, 0])), over) as Record<ItemKind, number>

describe('해금 정의', () => {
  test('항목은 23개이고 id가 겹치지 않는다', () => {
    expect(UNLOCKS.length).toBe(23)
    expect(new Set(UNLOCKS.map(u => u.id)).size).toBe(23)
    expect(UNLOCK_ORDER).toEqual(UNLOCKS.map(u => u.id))
  })

  test('선행 항목은 모두 목록에서 자신보다 앞에 있다', () => {
    for (const u of UNLOCKS) for (const r of u.requires) {
      expect(UNLOCK_ORDER.indexOf(r)).toBeLessThan(UNLOCK_ORDER.indexOf(u.id))
    }
  })

  test('모든 문법이 어떤 항목에서든 해금된다', () => {
    expect([...unlockedFeatures(new Set(UNLOCK_ORDER))].sort()).toEqual([...ALL_FEATURES].sort())
    const titles = featureTitles()
    expect(titles.loop).toBe('반복')
    expect(titles.cond).toBe('조건문')
    expect(titles.dict).toBe('딕셔너리')
  })

  test('비용을 내려면 그 자원을 얻을 수 있는 항목이 이미 해금되어 있어야 한다', () => {
    const source: Partial<Record<ItemKind, UnlockId | null>> = {
      Daisy: null, Strawberry: 'strawberry', Tulip: 'tulip', Power: 'sunflower', Tomato: 'tomato', Coin: 'crate',
    }
    const ancestors = (id: UnlockId): Set<UnlockId> => {
      const out = new Set<UnlockId>()
      const walk = (x: UnlockId) => { for (const r of unlockDef(x).requires) { if (!out.has(r)) { out.add(r); walk(r) } } }
      walk(id)
      return out
    }
    for (const u of UNLOCKS) for (const k of Object.keys(u.cost) as ItemKind[]) {
      const need = source[k]
      expect(need, `${u.id}의 비용 ${k}`).not.toBeUndefined()
      if (need) expect(ancestors(u.id).has(need) || u.id === need, `${u.id}는 ${need} 뒤에 와야 합니다`).toBe(true)
    }
  })

  test('제목과 설명이 비어 있지 않다', () => {
    for (const u of UNLOCKS) {
      expect(u.title.length).toBeGreaterThan(0)
      expect(u.summary).toMatch(/니다\.$/)
    }
  })
})

describe('구입 조건', () => {
  test('비용과 선행 항목을 모두 충족해야 한다', () => {
    expect(canBuy(new Set(), items({ Daisy: 5 }), 'loop')).toBe(true)
    expect(canBuy(new Set(), items({ Daisy: 4 }), 'loop')).toBe(false)
    expect(canBuy(new Set(), items({ Daisy: 999 }), 'expand1')).toBe(false)
    expect(canBuy(new Set(['loop']), items({ Daisy: 999 }), 'expand1')).toBe(true)
  })

  test('이미 해금한 항목은 다시 살 수 없다', () => {
    expect(canBuy(new Set(['loop']), items({ Daisy: 999 }), 'loop')).toBe(false)
  })
})

describe('해금 효과', () => {
  test('작물과 속도', () => {
    expect([...unlockedPlants(new Set())]).toEqual(['Daisy'])
    expect(unlockedPlants(new Set(['strawberry', 'tulip'] as UnlockId[])).has('Tulip')).toBe(true)
    expect(speedMultiplier(new Set())).toBe(1)
    expect(speedMultiplier(new Set(['speed1'] as UnlockId[]))).toBe(1.5)
    expect(speedMultiplier(new Set(['speed1', 'speed2'] as UnlockId[]))).toBe(2)
  })

  test('선반 확장은 1×1 → 3×1 → 3×3 → 4×4 → 6×6 순서이다', () => {
    expect(['expand1', 'expand2', 'expand3', 'expand4'].map(id => unlockDef(id as UnlockId).size)).toEqual([
      { w: 3, h: 1 }, { w: 3, h: 3 }, { w: 4, h: 4 }, { w: 6, h: 6 },
    ])
  })
})
```

`tests/progress/droneApi.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { World } from '../../src/sim/world'
import { buildDroneApi } from '../../src/progress/droneApi'
import { UNLOCK_ORDER, featureTitles, unlockedFeatures, type UnlockId } from '../../src/progress/unlocks'
import { compile } from '../../src/lang'

const setup = (unlocked: UnlockId[], size = 3) => {
  const world = World.create(1)
  world.resize(size, size)
  const out: string[] = []
  const set = new Set(unlocked)
  const api = buildDroneApi(world, set, t => out.push(t))
  const exec = (src: string, ticks = 100000) => {
    const r = compile(src, { features: unlockedFeatures(set), featureTitles: featureTitles(), globals: api.globals, lockedNames: api.lockedNames })
    if (!r.ok) return { status: 'error' as const, error: r.error }
    return r.program.step(ticks)
  }
  return { world, out, exec, api }
}
const ALL = UNLOCK_ORDER

describe('드론 함수', () => {
  test('처음에는 harvest와 print만 사용할 수 있다', () => {
    const { exec, world } = setup([], 1)
    expect(exec('harvest()').status).toBe('done')
    expect(world.state.items.Daisy).toBe(1)
    const r = exec('move(Right)')
    expect(r.status).toBe('error')
    expect(r.error!.kind).toBe('locked')
    expect(r.error!.message).toContain("'선반 확장 1'")
  })

  test('동작 함수는 200틱, 감지 함수는 1틱을 쓴다', () => {
    const { api } = setup(ALL)
    const ticks = (name: string) => (api.globals.get(name) as { ticks: number }).ticks
    for (const n of ['move', 'harvest', 'plant', 'water', 'swap']) expect(ticks(n), n).toBe(200)
    for (const n of ['can_harvest', 'get_plant_type', 'get_water', 'measure', 'get_pos_x', 'get_pos_y', 'get_world_size', 'num_items', 'print']) expect(ticks(n), n).toBe(1)
  })

  test('이동, 위치, 선반 크기', () => {
    const { exec, out } = setup(ALL)
    exec('move(Right)\nmove(Up)\nprint(get_pos_x())\nprint(get_pos_y())\nprint(get_world_size())')
    expect(out).toEqual(['1', '1', '3'])
  })

  test('심기, 작물 확인, 자원 수', () => {
    const { exec, out } = setup(ALL)
    exec('harvest()\nprint(num_items(Daisy))\nprint(plant(Strawberry))\nprint(get_plant_type() == Strawberry)\nprint(can_harvest())\nmove(Up)\nmove(Up)\nprint(get_plant_type())')
    expect(out).toEqual(['1', 'True', 'True', 'False', 'None'])
  })

  test('해금하지 않은 작물을 심으면 실행 중 오류이다', () => {
    const { exec } = setup(['loop', 'expand1', 'cond', 'strawberry'])
    const r = exec('plant(Tulip)')
    expect(r.status).toBe('error')
    expect(r.error!.kind).toBe('runtime')
    expect(r.error!.message).toContain('튤립')
  })

  test('잘못된 인자는 한국어로 안내한다', () => {
    const { exec } = setup(ALL)
    expect(exec('move(3)').error!.message).toContain('방향')
    expect(exec('plant(Right)').error!.message).toContain('작물')
    expect(exec('num_items(Up)').error!.message).toContain('자원')
  })

  test('measure와 swap', () => {
    const { exec, out, world } = setup(ALL)
    Object.assign(world.cellAt(0, 0), { plant: 'Crate', growth: 1, value: 8 })
    Object.assign(world.cellAt(1, 0), { plant: 'Crate', growth: 1, value: 3 })
    exec('print(measure())\nprint(measure(Right))\nif measure() > measure(Right):\n    swap(Right)\nprint(measure())')
    expect(out).toEqual(['8', '3', '3'])
  })

  test('print는 여러 종류의 값을 출력한다', () => {
    const { exec, out } = setup(ALL)
    exec('print("안녕")\nprint(Daisy)\nprint([1, Right])')
    expect(out).toEqual(['안녕', 'Daisy', '[1, Right]'])
  })

  test('for 반복을 해금해야 range를 쓸 수 있고, 리스트를 해금해야 len을 쓸 수 있다', () => {
    const before = setup(UNLOCK_ORDER.slice(0, UNLOCK_ORDER.indexOf('for')))
    expect(before.api.lockedNames.get('range')).toBe('for 반복')
    expect(before.api.lockedNames.get('len')).toBe('리스트')
    const after = setup(ALL)
    expect(after.api.globals.has('range')).toBe(true)
    expect(after.api.lockedNames.size).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/progress`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: unlocks.ts 구현**

`UNLOCKS`를 아래 표대로 정의한다. `plants`, `features`, `names`에서 비어 있는 칸은 빈 배열이다.

| id | title | cost | requires | features | names | plants | 효과 |
|---|---|---|---|---|---|---|---|
| loop | 반복 | Daisy 5 | — | loop | | | |
| speed1 | 드론 속도 1 | Daisy 20 | loop | | | | speed 1.5 |
| expand1 | 선반 확장 1 | Daisy 30 | loop | | move | | size 3×1 |
| cond | 조건문 | Daisy 50 | expand1 | cond | can_harvest, get_plant_type | | |
| strawberry | 딸기 | Daisy 80 | cond | | plant | Strawberry | |
| expand2 | 선반 확장 2 | Strawberry 50 | strawberry | | | | size 3×3 |
| watering | 물주기 | Strawberry 80 | strawberry | | water, get_water | | waterCap 20 |
| var | 변수 | Strawberry 100 | strawberry | var | get_pos_x, get_pos_y, get_world_size, num_items, abs | | |
| func | 함수 | Strawberry 150, Daisy 200 | var | func | | | |
| tulip | 튤립 | Strawberry 200 | var | | | Tulip | |
| for | for 반복 | Tulip 100 | tulip | for | range | | |
| expand3 | 선반 확장 3 | Tulip 200 | tulip | | | | size 4×4 |
| speed2 | 드론 속도 2 | Tulip 300 | tulip | | | | speed 2 |
| sunflower | 해바라기 | Tulip 400, Strawberry 400 | for | | measure | Sunflower | |
| list | 리스트 | Power 50 | sunflower | list | len, min, max | | |
| tomato | 토마토 | Tulip 800 | list | | | Tomato | |
| expand4 | 선반 확장 4 | Tomato 300 | tomato | | | | size 6×6 |
| dict | 딕셔너리 | Tomato 600 | tomato | dict | | | |
| crate | 과일 상자 | Tomato 1000 | dict | | swap | Crate | |
| yieldDaisy | 데이지 수확량 강화 | Daisy 300 | loop | | | | yieldMult Daisy |
| yieldStrawberry | 딸기 수확량 강화 | Strawberry 300 | strawberry | | | | yieldMult Strawberry |
| yieldTulip | 튤립 수확량 강화 | Tulip 300 | tulip | | | | yieldMult Tulip |
| automation | 완전 자동화 | Coin 5000 | crate | | | | 엔딩 |

`summary`는 항목마다 합니다체 한 문장으로 쓴다. 예: loop는 `'같은 코드를 계속 반복해서 실행할 수 있습니다.'`, expand1은 `'선반이 가로 3칸으로 넓어지고 드론이 이동할 수 있습니다.'`, automation은 `'정거장의 온실을 완전히 자동화합니다.'`.

- `featureTitles()`는 각 문법을 `features`에 가진 항목의 `title`을 돌려준다.
- `speedMultiplier`는 해금한 항목의 `speed` 가운데 가장 큰 값이고, 없으면 1이다.
- `canBuy`: 이미 해금했으면 `false`, `requires`를 모두 해금했고 `cost`의 모든 자원이 충분하면 `true`이다.

- [ ] **Step 4: droneApi.ts 구현**

```ts
import { World } from '../sim/world'
import { PLANT_KINDS, ITEM_KINDS, type Dir, type ItemKind, type PlantKind } from '../sim/types'
import { builtins } from '../lang/builtins'
import { constant, display, host, type Value } from '../lang/values'
import { UNLOCKS, unlockedPlants, type UnlockId } from './unlocks'

export const PLANT_LABEL: Record<PlantKind, string> = {
  Daisy: '데이지', Strawberry: '딸기', Tulip: '튤립', Sunflower: '해바라기', Tomato: '토마토', Crate: '과일 상자',
}
export const ITEM_LABEL: Record<ItemKind, string> = { ...PLANT_LABEL, Power: '전력', Coin: '코인', Water: '물' }

const DIRS: Dir[] = ['Right', 'Left', 'Up', 'Down']
const ACTION = 200
const SENSE = 1
```

`buildDroneApi` 구현 규칙:

- 상수(`Right`, `Left`, `Up`, `Down`, 작물 6종, `Power`, `Coin`, `Water`)는 해금 여부와 관계없이 항상 `globals`에 넣는다.
- 인자 변환 도우미 세 개를 둔다. 값이 `k: 'const'`이고 이름이 해당 목록에 있으면 그 이름을 돌려주고, 아니면 `Error`를 던진다.
  - `asDir`: `'방향은 Right, Left, Up, Down 가운데 하나여야 합니다.'`
  - `asPlant`: `'심을 작물은 Daisy, Strawberry, Tulip, Sunflower, Tomato, Crate 가운데 하나여야 합니다.'`
  - `asItem`: `'자원 이름이 올바르지 않습니다. 예: num_items(Daisy)'`
- 함수 정의표(이름, 틱, 최소·최대 인자 수, 구현):

| 이름 | 틱 | 인자 | 구현 |
|---|---|---|---|
| harvest | 200 | 0 | `world.harvest()` |
| print | 1 | 1 | `print(display(a[0]))`, `null` 반환 |
| move | 200 | 1 | `world.move(asDir(a[0]))` |
| can_harvest | 1 | 0 | `world.canHarvest()` |
| get_plant_type | 1 | 0 | 작물이 있으면 `constant(이름)`, 없으면 `null` |
| plant | 200 | 1 | 작물이 `unlockedPlants`에 없으면 `` Error(`${PLANT_LABEL[k]}은(는) 아직 해금하지 않았습니다.`) `` 대신 `` Error(`아직 해금하지 않은 작물입니다: ${PLANT_LABEL[k]}`) ``, 있으면 `world.plant(k)` |
| water | 200 | 0 | `world.water()` |
| get_water | 1 | 0 | `world.getWater()` |
| get_pos_x, get_pos_y | 1 | 0 | `world.state.droneX`, `droneY` |
| get_world_size | 1 | 0 | `world.state.w` |
| num_items | 1 | 1 | `Math.floor(world.state.items[asItem(a[0])])` |
| measure | 1 | 0~1 | `world.measure(a.length ? asDir(a[0]) : undefined)` |
| swap | 200 | 1 | `world.swap(asDir(a[0]))` |

- `harvest`와 `print`는 항상 `globals`에 넣는다. 그 밖의 함수와 내장 함수(`range`, `len`, `min`, `max`, `abs`)는 그 이름을 `names`에 가진 항목을 해금했으면 `globals`에, 아니면 `lockedNames`에 `이름 → 항목 title`로 넣는다.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/progress && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: 해금 정의와 드론 함수 연결 추가"
```

---

### Task 9: 진행 — Game 제어기

**Files:**
- Create: `src/progress/game.ts`
- Test: `tests/progress/game.test.ts`

**Interfaces:**
- Consumes: `World`, `compile`, `Program`, `buildDroneApi`, `UNLOCKS`, `canBuy`, `unlockDef`, `unlockedFeatures`, `featureTitles`, `speedMultiplier`
- Produces:

```ts
export interface Settings { guide: boolean; sound: boolean }
export interface OutputLine { kind: 'print' | 'error' | 'info'; text: string }
export type RunStatus = 'idle' | 'running' | 'error'
export const BASE_TICKS_PER_SECOND = 400
export const MAX_FRAME_MS = 250
export const MAX_OUTPUT_LINES = 200

export class Game {
  world: World
  unlocked: Set<UnlockId>
  code: string
  playMs: number
  finishedAtMs: number | null        // 엔딩을 본 시점의 playMs
  settings: Settings
  seenGuides: Set<UnlockId>
  output: OutputLine[]
  status: RunStatus
  currentLine: number                // 실행 중이 아니면 0
  errorLine: number                  // 오류가 없으면 0
  static create(seed: number): Game
  run(): boolean                     // 컴파일에 성공하면 true
  stop(): void
  stepOnce(): void                   // 실행 중이 아니면 컴파일한 뒤 문장 하나를 실행하고 멈춘다
  readonly paused: boolean           // stepOnce로 멈춰 있는 상태
  tick(dtMs: number): void           // 한 프레임 진행
  ticksPerSecond(): number
  canBuy(id: UnlockId): boolean
  buy(id: UnlockId): boolean
}
```

초기 `code`는 `'harvest()\n'`이고, `settings`는 `{ guide: true, sound: true }`이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/progress/game.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Game, MAX_OUTPUT_LINES } from '../../src/progress/game'
import { UNLOCK_ORDER } from '../../src/progress/unlocks'

const simulate = (g: Game, ms: number, frame = 50) => { for (let t = 0; t < ms; t += frame) g.tick(frame) }
const full = () => {
  const g = Game.create(1)
  for (const id of UNLOCK_ORDER) if (id !== 'automation') { g.unlocked.add(id) }
  g.world.resize(6, 6)
  return g
}

describe('실행 제어', () => {
  test('처음 코드는 harvest() 한 줄이고, 실행하면 데이지 1을 얻는다', () => {
    const g = Game.create(1)
    expect(g.code.trim()).toBe('harvest()')
    expect(g.run()).toBe(true)
    expect(g.status).toBe('running')
    simulate(g, 1000)
    expect(g.world.state.items.Daisy).toBe(1)
    expect(g.status).toBe('idle')
    expect(g.currentLine).toBe(0)
  })

  test('동작 하나에 0.5초가 걸린다', () => {
    const g = full()
    g.code = 'while True:\n    move(Right)'
    g.run()
    simulate(g, 5000)
    const moves = g.world.takeEvents().filter(e => e.type === 'move').length
    expect(moves).toBeGreaterThanOrEqual(9)
    expect(moves).toBeLessThanOrEqual(21)      // 속도 2 해금 상태이므로 초당 최대 4번
  })

  test('속도 강화와 전력이 초당 틱에 반영된다', () => {
    const g = Game.create(1)
    expect(g.ticksPerSecond()).toBe(400)
    g.unlocked.add('speed1')
    expect(g.ticksPerSecond()).toBe(600)
    g.world.state.items.Power = 1
    expect(g.ticksPerSecond()).toBe(1200)
  })

  test('구문 오류는 실행하지 않고 출력과 오류 줄로 알린다', () => {
    const g = full()
    g.code = 'harvest()\nwhile True\n    harvest()'
    expect(g.run()).toBe(false)
    expect(g.status).toBe('error')
    expect(g.errorLine).toBe(2)
    expect(g.output.at(-1)!.kind).toBe('error')
    expect(g.output.at(-1)!.text).toContain('2번째 줄')
  })

  test('실행 중 오류가 나면 멈추고 온실 상태는 유지된다', () => {
    const g = full()
    g.code = 'harvest()\nx = 1 / 0\nharvest()'
    g.run()
    simulate(g, 3000)
    expect(g.status).toBe('error')
    expect(g.errorLine).toBe(2)
    expect(g.world.state.items.Daisy).toBe(1)
  })

  test('다시 실행하면 오류 표시가 지워진다', () => {
    const g = full()
    g.code = 'x = 1 / 0'
    g.run(); simulate(g, 500)
    g.code = 'harvest()'
    expect(g.run()).toBe(true)
    expect(g.errorLine).toBe(0)
  })

  test('정지하면 프로그램이 멈추고 식물은 계속 자란다', () => {
    const g = Game.create(1)
    g.unlocked.add('loop')
    g.code = 'while True:\n    harvest()'
    g.run(); simulate(g, 1000)
    g.stop()
    expect(g.status).toBe('idle')
    const before = g.world.state.items.Daisy
    simulate(g, 5000)
    expect(g.world.state.items.Daisy).toBe(before)
    expect(g.world.canHarvest()).toBe(true)
  })

  test('한 단계 실행은 문장 하나만 실행하고 멈춘 상태로 남는다', () => {
    const g = full()
    g.code = 'print(1)\nprint(2)'
    g.stepOnce()
    expect(g.output.filter(o => o.kind === 'print').map(o => o.text)).toEqual(['1'])
    expect(g.paused).toBe(true)
    expect(g.currentLine).toBe(2)
    simulate(g, 2000)
    expect(g.output.filter(o => o.kind === 'print').length).toBe(1)
    g.stepOnce()
    expect(g.output.filter(o => o.kind === 'print').map(o => o.text)).toEqual(['1', '2'])
  })

  test('멈춘 상태에서 실행하기를 누르면 이어서 실행한다', () => {
    const g = full()
    g.code = 'print(1)\nprint(2)\nprint(3)'
    g.stepOnce()
    g.run()
    simulate(g, 1000)
    expect(g.output.filter(o => o.kind === 'print').map(o => o.text)).toEqual(['1', '2', '3'])
  })
})

describe('견고성', () => {
  test('한 프레임의 경과 시간이 매우 커도 250ms만 진행한다', () => {
    const g = Game.create(1)
    g.tick(10 * 60 * 1000)
    expect(g.playMs).toBe(250)
    expect(g.world.state.timeMs).toBe(250)
  })

  test('음수나 NaN 경과 시간은 무시한다', () => {
    const g = Game.create(1)
    g.tick(-5); g.tick(NaN)
    expect(g.playMs).toBe(0)
  })

  test('무한 반복에서 print를 호출해도 출력은 200줄을 넘지 않는다', () => {
    const g = full()
    g.code = 'i = 0\nwhile True:\n    print(i)\n    i += 1'
    g.run()
    simulate(g, 20000)
    expect(g.output.length).toBeLessThanOrEqual(MAX_OUTPUT_LINES)
    expect(Number(g.output.at(-1)!.text)).toBeGreaterThan(MAX_OUTPUT_LINES)
  })

  test('실행 중에 선반을 확장해도 프로그램이 계속 실행된다', () => {
    const g = Game.create(1)
    g.unlocked.add('loop')
    g.world.state.items.Daisy = 1000
    g.code = 'while True:\n    harvest()'
    g.run(); simulate(g, 1000)
    expect(g.buy('expand1')).toBe(true)
    simulate(g, 3000)
    expect(g.status).toBe('running')
    expect(g.world.state.w).toBe(3)
    expect([g.world.state.droneX, g.world.state.droneY]).toEqual([0, 0])
  })

  test('실행 중에 해금한 함수는 다시 실행해야 사용할 수 있다', () => {
    const g = Game.create(1)
    g.unlocked.add('loop')
    g.world.state.items.Daisy = 1000
    g.code = 'while True:\n    harvest()'
    g.run()
    g.buy('expand1')
    g.stop()
    g.code = 'move(Right)'
    expect(g.run()).toBe(true)
  })
})

describe('해금', () => {
  test('구입하면 자원이 줄고 효과가 적용된다', () => {
    const g = Game.create(1)
    g.world.state.items.Daisy = 100
    expect(g.canBuy('loop')).toBe(true)
    expect(g.buy('loop')).toBe(true)
    expect(g.world.state.items.Daisy).toBe(95)
    expect(g.unlocked.has('loop')).toBe(true)
    expect(g.buy('loop')).toBe(false)
    g.buy('expand1')
    expect([g.world.state.w, g.world.state.h]).toEqual([3, 1])
  })

  test('물주기를 해금하면 물탱크가 생기고, 수확량 강화는 배율을 2로 만든다', () => {
    const g = full()
    g.unlocked.delete('watering'); g.unlocked.delete('yieldDaisy')
    g.world.state.items.Strawberry = 1000; g.world.state.items.Daisy = 1000
    g.buy('watering'); g.buy('yieldDaisy')
    expect(g.world.state.waterCap).toBe(20)
    expect(g.world.state.yieldMult.Daisy).toBe(2)
  })

  test('완전 자동화를 구입하면 엔딩 시점을 기록하고, 그 뒤에도 계속 진행된다', () => {
    const g = full()
    g.world.state.items.Coin = 5000
    simulate(g, 1000)
    expect(g.finishedAtMs).toBeNull()
    g.buy('automation')
    expect(g.finishedAtMs).toBe(1000)
    simulate(g, 1000)
    expect(g.playMs).toBe(2000)
    expect(g.finishedAtMs).toBe(1000)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/progress/game.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현**

`src/progress/game.ts` 구현 규칙:

- `run()`:
  1. `paused` 상태이면 멈춤만 풀고 `true`를 돌려준다(다시 컴파일하지 않는다).
  2. `errorLine`을 0으로 되돌린다. `buildDroneApi(world, unlocked, text => this.pushOutput('print', text))`로 전역을 만들고 `compile`을 호출한다.
  3. 실패하면 `status = 'error'`, `errorLine = error.line`으로 정하고 `` `${error.line}번째 줄: ${error.message}` ``를 `error` 종류로 출력한 뒤 `false`를 돌려준다.
  4. 성공하면 `program`을 보관하고 `status = 'running'`, `currentLine = 0`으로 정한 뒤 `true`를 돌려준다.
- `stop()`: `program = null`, `status = 'idle'`, `currentLine = 0`, `paused = false`.
- `stepOnce()`: 프로그램이 없으면 `run()`을 호출하고(실패하면 끝낸다), `paused = true`로 정한 다음 `program.stepStatement()`의 결과를 `applyResult`에 넘긴다.
- `tick(dtMs)`:
  1. `dtMs`가 유한한 양수가 아니면 아무것도 하지 않는다. `MAX_FRAME_MS`보다 크면 `MAX_FRAME_MS`로 줄인다.
  2. 최대 50ms 단위로 나누어 반복한다. 단위마다 `world.advance(slice)`, `playMs += slice`를 한 다음, 프로그램이 실행 중이고 멈춘 상태가 아니면 `program.step(slice * ticksPerSecond() / 1000)`의 결과를 `applyResult`에 넘긴다.
- `applyResult(r)`: `running`이면 `currentLine = r.line`. `done`이면 `stop()`. `error`이면 `` `${r.line}번째 줄: ${r.error.message}` ``를 출력하고 `stop()`을 한 뒤 `status = 'error'`, `errorLine = r.line`으로 정한다.
- `pushOutput(kind, text)`: 배열에 넣고 길이가 `MAX_OUTPUT_LINES`를 넘으면 앞에서부터 버린다.
- `ticksPerSecond()`: `BASE_TICKS_PER_SECOND × speedMultiplier(unlocked) × (items.Power > 0 ? 2 : 1)`.
- `buy(id)`: `canBuy`가 거짓이면 `false`. 비용을 차감하고 `unlocked`에 넣은 다음 효과를 적용한다. `size`가 있으면 `world.resize`, `waterCap`이 있으면 `world.state.waterCap`에 대입, `yieldMult`가 있으면 해당 배율을 2로, `id === 'automation'`이면 `finishedAtMs = playMs`. 실행 중인 프로그램은 건드리지 않는다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/progress`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Game 제어기 추가"
```

---

### Task 10: 진행 — 저장과 불러오기

**Files:**
- Create: `src/progress/save.ts`
- Test: `tests/progress/save.test.ts`

**Interfaces:**
- Consumes: `Game`, `World`, `WorldState`, `UNLOCK_ORDER`
- Produces:

```ts
export const SAVE_KEY = 'gardener-replaced:save:v1'
export const CORRUPT_KEY = 'gardener-replaced:save:corrupt'
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export function serialize(game: Game): string
export function deserialize(json: string): Game | null     // 읽을 수 없으면 null
export function loadGame(storage: StorageLike, seed: number): Game
export function saveGame(storage: StorageLike, game: Game): boolean
export function resetGame(storage: StorageLike): void
```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/progress/save.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Game } from '../../src/progress/game'
import { CORRUPT_KEY, SAVE_KEY, deserialize, loadGame, resetGame, saveGame, serialize, type StorageLike } from '../../src/progress/save'

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: k => { data.delete(k) } }
}
const played = () => {
  const g = Game.create(3)
  g.world.state.items.Daisy = 500
  g.buy('loop'); g.buy('expand1')
  g.code = 'while True:\n    harvest()\n    move(Right)'
  g.settings.guide = false
  g.seenGuides.add('loop')
  g.run()
  for (let i = 0; i < 100; i++) g.tick(50)
  return g
}

describe('저장과 불러오기', () => {
  test('저장했다가 불러오면 코드, 자원, 해금, 선반, 설정, 플레이 시간이 같다', () => {
    const g = played()
    const r = deserialize(serialize(g))!
    expect(r.code).toBe(g.code)
    expect(r.world.state).toEqual(g.world.state)
    expect([...r.unlocked]).toEqual([...g.unlocked])
    expect(r.settings).toEqual(g.settings)
    expect([...r.seenGuides]).toEqual(['loop'])
    expect(r.playMs).toBe(g.playMs)
    expect(r.finishedAtMs).toBeNull()
  })

  test('불러온 게임은 프로그램이 정지된 상태이고, 다시 실행할 수 있다', () => {
    const r = deserialize(serialize(played()))!
    expect(r.status).toBe('idle')
    expect(r.run()).toBe(true)
  })

  test('불러온 뒤에도 난수가 이어진다', () => {
    const a = played()
    const b = deserialize(serialize(a))!
    a.world.advance(5000); b.world.advance(5000)
    expect(b.world.state).toEqual(a.world.state)
  })

  test.each([
    ['빈 문자열', ''],
    ['JSON이 아님', '{{{'],
    ['버전이 다름', JSON.stringify({ version: 99 })],
    ['필드가 빠짐', JSON.stringify({ version: 1, code: 'x' })],
    ['칸 수가 크기와 맞지 않음', (() => { const o = JSON.parse(serialize(Game.create(1))); o.world.w = 3; return JSON.stringify(o) })()],
    ['알 수 없는 해금 id', (() => { const o = JSON.parse(serialize(Game.create(1))); o.unlocked = ['nope']; return JSON.stringify(o) })()],
    ['자원이 숫자가 아님', (() => { const o = JSON.parse(serialize(Game.create(1))); o.world.items.Daisy = 'many'; return JSON.stringify(o) })()],
  ])('읽을 수 없는 데이터(%s)는 null을 돌려준다', (_name, json) => {
    expect(deserialize(json)).toBeNull()
  })
})

describe('저장소', () => {
  test('저장된 데이터가 없으면 새 게임으로 시작한다', () => {
    const g = loadGame(memory(), 1)
    expect(g.unlocked.size).toBe(0)
  })

  test('저장하고 다시 불러온다', () => {
    const s = memory()
    expect(saveGame(s, played())).toBe(true)
    expect(loadGame(s, 1).unlocked.has('expand1')).toBe(true)
  })

  test('깨진 데이터는 별도 키로 옮기고 새 게임으로 시작한다', () => {
    const s = memory()
    s.setItem(SAVE_KEY, '{{{')
    const g = loadGame(s, 1)
    expect(g.unlocked.size).toBe(0)
    expect(s.getItem(CORRUPT_KEY)).toBe('{{{')
  })

  test('저장소가 예외를 던져도 게임은 계속된다', () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error('차단됨') },
      setItem: () => { throw new Error('용량 초과') },
      removeItem: () => { throw new Error('차단됨') },
    }
    expect(loadGame(broken, 1).unlocked.size).toBe(0)
    expect(saveGame(broken, Game.create(1))).toBe(false)
    expect(() => resetGame(broken)).not.toThrow()
  })

  test('초기화는 이 게임의 키만 지운다', () => {
    const s = memory()
    s.setItem('other-game:save', 'keep')
    s.setItem(CORRUPT_KEY, 'x')
    saveGame(s, played())
    resetGame(s)
    expect(s.getItem(SAVE_KEY)).toBeNull()
    expect(s.getItem(CORRUPT_KEY)).toBeNull()
    expect(s.getItem('other-game:save')).toBe('keep')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/progress/save.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현**

저장 형식:

```ts
interface SaveData {
  version: 1
  code: string
  unlocked: UnlockId[]
  world: WorldState
  playMs: number
  finishedAtMs: number | null
  settings: Settings
  seenGuides: UnlockId[]
}
```

- `serialize`: 위 형식의 JSON 문자열을 만든다. `world`는 `structuredClone` 없이 `JSON.stringify`로 충분하다.
- `deserialize`: `JSON.parse`를 `try`로 감싼다. 다음을 모두 확인하고 하나라도 어긋나면 `null`을 돌려준다.
  - `version === 1`, `code`가 문자열, `playMs`가 유한한 0 이상의 수, `finishedAtMs`가 `null`이거나 수
  - `unlocked`와 `seenGuides`가 배열이고 모든 원소가 `UNLOCK_ORDER`에 있음
  - `settings.guide`와 `settings.sound`가 불리언
  - `world.w`, `world.h`가 1~6의 정수, `world.cells.length === w * h`, 칸마다 `plant`가 `null`이거나 `PLANT_KINDS`에 있고 `growth`, `water`, `value`가 유한한 수이며 `wilted`가 불리언
  - `droneX`, `droneY`가 선반 범위 안의 정수
  - `ITEM_KINDS`의 모든 자원이 유한한 0 이상의 수, `yieldMult`의 세 값과 `waterCap`, `waterTimerMs`, `powerActions`, `rng`, `timeMs`가 유한한 수
  - 통과하면 `Game.create(0)`으로 만든 객체에 값을 채워 돌려준다. `world`는 `new World(state)`로 만든다.
- `loadGame`: 전체를 `try`로 감싼다. 값이 없으면 `Game.create(seed)`. `deserialize`가 `null`이면 원본 문자열을 `CORRUPT_KEY`에 저장하고(이 쓰기도 `try`로 감싼다) `Game.create(seed)`를 돌려준다.
- `saveGame`: `try` 안에서 `setItem`을 하고 성공 여부를 돌려준다.
- `resetGame`: `SAVE_KEY`와 `CORRUPT_KEY`만 각각 `try` 안에서 `removeItem`한다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/progress`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 저장과 불러오기 추가"
```

---

### Task 11: 진행 — 안내 내용과 균형 조정

**Files:**
- Create: `src/progress/guide.ts`, `tests/progress/guide.test.ts`, `tests/balance.test.ts`, `tests/model/scripts.ts`
- Modify: `src/sim/balance.ts`, `src/progress/unlocks.ts` (수치 조정)

**Interfaces:**
- Consumes: `Game`, `UNLOCK_ORDER`, `UnlockId`, `compile`
- Produces:

```ts
// guide.ts
export interface GuideEntry {
  id: UnlockId | 'start'
  title: string
  body: string[]          // 합니다체 문장 2~3개
  example: string         // 예제 코드. 그 시점에 해금된 문법만 사용한다. 없으면 빈 문자열
  goal: string            // 스스로 해 볼 목표 한 문장
}
export const GUIDES: GuideEntry[]              // 'start' + 23개
export function guideFor(id: UnlockId | 'start'): GuideEntry
export interface FunctionDoc { name: string; signature: string; desc: string; unlock: UnlockId | null }
export const FUNCTION_DOCS: FunctionDoc[]      // 설명서의 함수 목록. 드론 함수 14개와 내장 함수 5개
```

이 Task의 균형 테스트는 "각 해금 단계에서 사용할 수 있는 문법만으로 작성한 모범 코드"를 `Game`에 실행시켜 엔딩까지 걸리는 시간을 측정한다. 모범 코드는 실행기의 통합 테스트 역할도 한다.

- [ ] **Step 1: 안내 내용 테스트 작성**

`tests/progress/guide.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { GUIDES, FUNCTION_DOCS, guideFor } from '../../src/progress/guide'
import { UNLOCK_ORDER, featureTitles, unlockedFeatures, type UnlockId } from '../../src/progress/unlocks'
import { buildDroneApi } from '../../src/progress/droneApi'
import { World } from '../../src/sim/world'
import { compile } from '../../src/lang'

describe('안내', () => {
  test('시작 안내와 모든 해금 항목의 안내가 있다', () => {
    expect(GUIDES.map(g => g.id)).toEqual(['start', ...UNLOCK_ORDER])
  })

  test('문장은 합니다체이고 목표가 있다', () => {
    for (const g of GUIDES) {
      expect(g.body.length, g.id).toBeGreaterThanOrEqual(2)
      for (const s of g.body) expect(s, g.id).toMatch(/(니다|세요)\.$/)
      expect(g.goal.length, g.id).toBeGreaterThan(0)
    }
  })

  test('예제 코드는 그 항목까지만 해금한 상태에서 잠금 오류 없이 컴파일된다', () => {
    for (const g of GUIDES) {
      if (!g.example) continue
      const upTo = g.id === 'start' ? [] : UNLOCK_ORDER.slice(0, UNLOCK_ORDER.indexOf(g.id) + 1)
      const unlocked = new Set<UnlockId>(upTo)
      const api = buildDroneApi(World.create(1), unlocked, () => {})
      const r = compile(g.example, { features: unlockedFeatures(unlocked), featureTitles: featureTitles(), globals: api.globals, lockedNames: api.lockedNames })
      expect(r.ok, `${g.id}: ${r.ok ? '' : r.error.message}`).toBe(true)
    }
  })

  test('함수 설명에는 모든 드론 함수가 있다', () => {
    const names = FUNCTION_DOCS.map(f => f.name)
    for (const n of ['harvest', 'print', 'move', 'can_harvest', 'get_plant_type', 'plant', 'water', 'get_water', 'get_pos_x', 'get_pos_y', 'get_world_size', 'num_items', 'measure', 'swap', 'range', 'len', 'min', 'max', 'abs']) {
      expect(names, n).toContain(n)
    }
    expect(guideFor('loop').title).toBe('반복')
  })
})
```

- [ ] **Step 2: guide.ts 작성**

`GUIDES`의 내용은 아래 표를 따른다. `body`는 표의 요지를 합니다체 2~3문장으로 풀어 쓰고, `title`은 해금 항목의 `title`과 같게 한다(`start`의 제목은 `'온실에 오신 것을 환영합니다'`).

| id | 요지 | 예제 | 목표 |
|---|---|---|---|
| start | 드론은 코드로만 움직인다. `harvest()`는 드론이 있는 칸의 작물을 수확한다. 실행하기를 누르면 코드가 위에서부터 한 줄씩 실행된다. | `harvest()` | 실행하기를 여러 번 눌러 데이지 5송이를 모아 보세요. |
| loop | `while True:` 아래에 들여 쓴 줄은 끝없이 반복된다. 들여쓰기는 스페이스 4칸이다. 정지하기로 멈춘다. | `while True:`⏎`    harvest()` | 실행하기를 한 번만 눌러 데이지가 계속 쌓이게 해 보세요. |
| speed1 | 드론이 1.5배 빨라진다. 동작 하나에 걸리는 시간이 줄어든다. | (없음) | 같은 코드를 다시 실행하여 속도를 확인해 보세요. |
| expand1 | 선반이 3칸이 된다. `move(Right)`는 오른쪽으로 한 칸 이동하고, 끝에서는 반대편으로 이어진다. | `while True:`⏎`    harvest()`⏎`    move(Right)` | 세 화분을 모두 돌면서 수확해 보세요. |
| cond | `if 조건:` 아래의 줄은 조건이 참일 때에만 실행된다. `can_harvest()`는 다 자랐는지 알려 준다. | `while True:`⏎`    if can_harvest():`⏎`        harvest()`⏎`    move(Right)` | 다 자란 화분만 수확하게 해 보세요. |
| strawberry | `plant(Strawberry)`는 딸기를 심고 데이지 1을 쓴다. 덜 자란 딸기를 수확하면 사라지므로 `can_harvest()`로 확인해야 한다. | `while True:`⏎`    if can_harvest():`⏎`        harvest()`⏎`        plant(Strawberry)`⏎`    move(Right)` | 딸기 50개를 모아 보세요. |
| expand2 | 선반이 3×3이 된다. `move(Up)`으로 윗줄로 올라간다. | 한 줄을 다 돈 다음 `move(Up)`을 하는 코드 | 아홉 화분을 모두 돌아 보세요. |
| watering | `water()`는 물탱크의 물 1을 써서 화분을 적신다. 젖은 화분의 작물은 최대 5배 빨리 자란다. 물탱크는 10초마다 1씩 찬다. | 심은 직후에 `water()`를 하는 코드 | 물을 준 화분과 주지 않은 화분의 속도를 비교해 보세요. |
| var | `x = 3`처럼 값에 이름을 붙인다. `get_pos_x()`, `num_items(Daisy)` 같은 함수의 결과를 저장하고 계산할 수 있다. | `x = 0`⏎`while x < get_world_size():`⏎`    harvest()`⏎`    move(Right)`⏎`    x += 1` | 데이지가 20송이보다 적을 때에만 딸기를 심지 않게 해 보세요. |
| func | `def 이름():`으로 자주 쓰는 코드에 이름을 붙이고 `이름()`으로 호출한다. `return`으로 값을 돌려준다. | `def tend():`⏎`    if can_harvest():`⏎`        harvest()`⏎`        plant(Strawberry)`⏎⏎`while True:`⏎`    tend()`⏎`    move(Right)` | 한 줄을 도는 코드를 함수로 만들어 보세요. |
| tulip | 튤립은 한 번에 3송이를 주지만 상하좌우에 튤립이 있으면 느리게 자란다. `%`는 나머지를 구한다. | `if (get_pos_x() + get_pos_y()) % 2 == 0:`⏎`    plant(Tulip)` | 튤립끼리 붙지 않게 엇갈려 심어 보세요. |
| for | `for i in range(3):`은 아래 줄을 3번 반복하고 `i`는 0, 1, 2가 된다. | `for y in range(get_world_size()):`⏎`    for x in range(get_world_size()):`⏎`        harvest()`⏎`        move(Right)`⏎`    move(Up)` | `while`로 쓴 코드를 `for`로 바꿔 보세요. |
| expand3 | 선반이 4×4가 된다. `get_world_size()`를 사용한 코드는 고치지 않아도 된다. | (없음) | 코드에 3이라는 숫자가 남아 있는지 확인해 보세요. |
| speed2 | 드론이 처음의 2배로 빨라진다. | (없음) | 한 바퀴를 도는 데 걸리는 시간을 확인해 보세요. |
| sunflower | 해바라기는 전력을 준다. 전력이 있으면 드론이 2배 빨라진다. `measure()`는 꽃잎 수를 알려 준다. 다 자란 해바라기가 10송이 이상일 때 꽃잎이 가장 많은 것을 수확하면 8배를 얻는다. | `if measure() == 15:`⏎`    harvest()` | 꽃잎이 많은 것부터 차례로 수확해 보세요. |
| list | 리스트는 여러 값을 순서대로 담는다. `append()`로 넣고 `[번호]`로 꺼내며 `max()`로 가장 큰 값을 구한다. | `petals = []`⏎`petals.append(measure())`⏎`print(max(petals))` | 꽃잎 수를 모두 리스트에 담고 가장 큰 값을 찾아 보세요. |
| tomato | 토마토는 익을 때 20% 확률로 시든다. n×n 정사각형이 모두 익었을 때 수확하면 n³개를 얻는다. 시든 자리에는 다시 심어야 한다. | 선반을 돌면서 `plant(Tomato)`를 하고, 모두 익었는지 세는 코드 | 4×4를 모두 익혀 64개를 한 번에 수확해 보세요. |
| expand4 | 선반이 6×6이 된다. 토마토 6×6은 216개를 준다. | (없음) | 6×6을 모두 채워 보세요. |
| dict | 딕셔너리는 이름표(키)로 값을 찾는다. `d[(x, y)] = 값`처럼 위치를 키로 쓸 수 있다. | `ready = {}`⏎`ready[(get_pos_x(), get_pos_y())] = can_harvest()` | 칸마다 상태를 기록해 다시 확인할 칸만 찾아가 보세요. |
| crate | `plant(Crate)`는 무게가 적힌 과일 상자를 놓는다. `swap(Right)`로 이웃과 바꾼다. 오른쪽과 위가 더 무겁거나 같게 정리한 뒤 수확하면 개수의 제곱만큼 코인을 얻는다. | `if measure() > measure(Right):`⏎`    swap(Right)` | 한 줄을 무게순으로 정리해 보세요. |
| yieldDaisy / yieldStrawberry / yieldTulip | 해당 작물의 수확량이 2배가 된다. | (없음) | 수확량이 늘어난 것을 화물칸에서 확인해 보세요. |
| automation | 온실이 완전히 자동화되었다. 걸린 시간을 확인하고, 더 빠른 코드에 도전할 수 있다. | (없음) | 처음부터 다시 시작하여 기록을 줄여 보세요. |

표에서 예제를 요지로만 적은 항목(expand2, watering, tomato)은 다음 코드를 사용한다.

```python
# expand2
while True:
    if can_harvest():
        harvest()
        plant(Strawberry)
    move(Right)
    if can_harvest():
        harvest()
        plant(Strawberry)
    move(Right)
    if can_harvest():
        harvest()
        plant(Strawberry)
    move(Right)
    move(Up)
```

```python
# watering
while True:
    if can_harvest():
        harvest()
        plant(Strawberry)
        water()
    move(Right)
```

```python
# tomato
n = get_world_size()
while True:
    ripe = 0
    for y in range(n):
        for x in range(n):
            plant(Tomato)
            if can_harvest():
                ripe += 1
            move(Right)
        move(Up)
    if ripe == n * n:
        harvest()
```

`FUNCTION_DOCS`는 함수마다 `signature`(예: `'move(방향)'`)와 합니다체 한 문장 설명, 그리고 그 함수를 여는 해금 항목을 적는다. 설명은 설계 문서 3절의 표를 따른다.

- [ ] **Step 3: 안내 테스트 통과 확인**

Run: `npx vitest run tests/progress/guide.test.ts`
Expected: PASS.

- [ ] **Step 4: 모범 코드 작성**

`tests/model/scripts.ts`. `from` 항목을 해금한 시점부터 다음 `from` 직전까지 이 코드를 실행한다.

```ts
import type { UnlockId } from '../../src/progress/unlocks'

export interface ModelStage { from: UnlockId | 'start'; code: string }

// 모범 플레이어가 해금 항목을 구입하는 순서. 수확량 강화는 그 작물을 주로 기르는 시기에 구입한다.
export const BUY_ORDER: UnlockId[] = [
  'loop', 'speed1', 'expand1', 'cond', 'yieldDaisy', 'strawberry', 'expand2', 'watering', 'var', 'func',
  'yieldStrawberry', 'tulip', 'for', 'yieldTulip', 'expand3', 'speed2', 'sunflower', 'list', 'tomato',
  'expand4', 'dict', 'crate', 'automation',
]

const TULIP_CODE = `def tend():
    if can_harvest():
        harvest()
    if num_items(Daisy) < 40:
        return 0
    if (get_pos_x() + get_pos_y()) % 2 == 0:
        plant(Tulip)
    else:
        plant(Strawberry)

while True:
    x = 0
    while x < get_world_size():
        tend()
        move(Right)
        x += 1
    move(Up)`

const TEND = `if can_harvest():
        harvest()
        plant(Strawberry)`

export const MODEL: ModelStage[] = [
  { from: 'start', code: 'harvest()' },
  { from: 'loop', code: 'while True:\n    harvest()' },
  { from: 'expand1', code: 'while True:\n    harvest()\n    move(Right)' },
  { from: 'cond', code: 'while True:\n    if can_harvest():\n        harvest()\n    move(Right)' },
  { from: 'strawberry', code: `while True:\n    ${TEND}\n    move(Right)` },
  { from: 'expand2', code: `while True:\n    ${TEND}\n    move(Right)\n    ${TEND}\n    move(Right)\n    ${TEND}\n    move(Right)\n    move(Up)` },
  {
    from: 'var',
    code: `while True:
    x = 0
    while x < get_world_size():
        if can_harvest():
            harvest()
        if num_items(Daisy) > 220:
            plant(Strawberry)
        move(Right)
        x += 1
    move(Up)`,
  },
  { from: 'tulip', code: TULIP_CODE },
  {
    from: 'sunflower',
    code: `n = get_world_size()

def sweep_plant():
    for y in range(n):
        for x in range(n):
            if can_harvest():
                harvest()
            if (x + y) % 4 == 0:
                plant(Tulip)
            else:
                if num_items(Strawberry) > 60:
                    plant(Sunflower)
                else:
                    plant(Strawberry)
            move(Right)
        move(Up)

def sweep_harvest(petals):
    for y in range(n):
        for x in range(n):
            if get_plant_type() == Sunflower:
                if can_harvest() and measure() >= petals:
                    harvest()
            else:
                if can_harvest():
                    harvest()
            move(Right)
        move(Up)

while True:
    sweep_plant()
    sweep_plant()
    for p in range(15, 6, -1):
        sweep_harvest(p)`,
  },
  { from: 'list', code: TULIP_CODE },
  {
    from: 'tomato',
    code: `n = get_world_size()

def stock():
    for y in range(n):
        for x in range(n):
            if can_harvest():
                harvest()
            if (x + y) % 2 == 0:
                plant(Tulip)
            move(Right)
        move(Up)

def tomatoes():
    while True:
        ripe = 0
        for y in range(n):
            for x in range(n):
                if get_plant_type() != Tomato:
                    if can_harvest():
                        harvest()
                plant(Tomato)
                if get_plant_type() == Tomato and can_harvest():
                    ripe += 1
                move(Right)
            move(Up)
        if ripe == n * n:
            harvest()
            return 0

while True:
    while num_items(Tulip) < n * n * 3:
        stock()
    tomatoes()`,
  },
  {
    from: 'crate',
    code: `n = get_world_size()

def go(tx, ty):
    while get_pos_x() != tx:
        move(Right)
    while get_pos_y() != ty:
        move(Up)

def stock():
    for y in range(n):
        for x in range(n):
            go(x, y)
            if can_harvest():
                harvest()
            if (x + y) % 2 == 0:
                plant(Tulip)

def tomatoes():
    while True:
        ripe = 0
        for y in range(n):
            for x in range(n):
                go(x, y)
                if get_plant_type() != Tomato:
                    if can_harvest():
                        harvest()
                plant(Tomato)
                if get_plant_type() == Tomato and can_harvest():
                    ripe += 1
        if ripe == n * n:
            harvest()
            return 0

def crates():
    filled = 0
    while filled < n * n:
        filled = 0
        for y in range(n):
            for x in range(n):
                go(x, y)
                if get_plant_type() != Crate:
                    harvest()
                    plant(Crate)
                if get_plant_type() == Crate:
                    filled += 1
    for y in range(n):
        for i in range(n - 1):
            go(0, y)
            for x in range(n - 1):
                if measure() > measure(Right):
                    swap(Right)
                move(Right)
    for x in range(n):
        for i in range(n - 1):
            go(x, 0)
            for y in range(n - 1):
                if measure() > measure(Up):
                    swap(Up)
                move(Up)
    go(0, 0)
    harvest()

while True:
    while num_items(Tomato) < n * n * 2:
        while num_items(Tulip) < n * n * 2:
            stock()
        tomatoes()
    crates()`,
  },
]
```

- [ ] **Step 5: 균형 테스트 작성**

`tests/balance.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Game } from '../src/progress/game'
import { UNLOCK_ORDER, type UnlockId } from '../src/progress/unlocks'
import { BUY_ORDER, MODEL } from './model/scripts'

const FRAME = 50
const MINUTE = 60000
const MAX_PER_UNLOCK = 12 * MINUTE
const TOTAL_MIN = 40 * MINUTE
const TOTAL_MAX = 120 * MINUTE

// 모범 플레이어: 해금 항목을 BUY_ORDER 순서대로 구입하고, 구입한 항목에 맞는 모범 코드로 바꿔 실행한다.
function playThrough(seed: number) {
  const g = Game.create(seed)
  const times: { id: UnlockId; ms: number }[] = []
  const errors: string[] = []
  let stage = MODEL[0]
  const start = () => { g.stop(); g.code = stage.code; if (!g.run()) errors.push(g.output.at(-1)!.text) }
  start()
  for (const id of BUY_ORDER) {
    const began = g.playMs
    while (!g.canBuy(id)) {
      g.tick(FRAME)
      if (g.status === 'error') { errors.push(`${stage.from}: ${g.output.at(-1)!.text}`); return { g, times, errors } }
      if (g.status === 'idle') start()                       // 끝나는 코드는 플레이어가 다시 실행한다
      if (g.playMs - began > MAX_PER_UNLOCK * 2) { errors.push(`${id}: 시간 초과`); return { g, times, errors } }
    }
    g.buy(id)
    times.push({ id, ms: g.playMs - began })
    const next = MODEL.find(m => m.from === id)
    if (next) { stage = next; start() }
  }
  return { g, times, errors }
}

describe('균형', () => {
  const result = playThrough(1)

  test('구입 순서는 모든 항목을 한 번씩 포함한다', () => {
    expect([...BUY_ORDER].sort()).toEqual([...UNLOCK_ORDER].sort())
  })

  test('모범 코드가 오류 없이 엔딩까지 진행한다', () => {
    expect(result.errors).toEqual([])
    expect(result.g.finishedAtMs).not.toBeNull()
  })

  test('어느 해금 항목도 12분을 넘기지 않는다', () => {
    const slow = result.times.filter(t => t.ms > MAX_PER_UNLOCK).map(t => `${t.id}: ${(t.ms / MINUTE).toFixed(1)}분`)
    expect(slow).toEqual([])
  })

  test('엔딩까지 40분에서 120분이 걸린다', () => {
    const total = result.g.finishedAtMs!
    console.log(result.times.map(t => `${t.id} ${(t.ms / MINUTE).toFixed(1)}분`).join('\n'))
    console.log(`합계 ${(total / MINUTE).toFixed(1)}분`)
    expect(total).toBeGreaterThanOrEqual(TOTAL_MIN)
    expect(total).toBeLessThanOrEqual(TOTAL_MAX)
  })

  test('다른 시드에서도 엔딩까지 진행한다', () => {
    const other = playThrough(12345)
    expect(other.errors).toEqual([])
    expect(other.g.finishedAtMs!).toBeLessThanOrEqual(TOTAL_MAX)
  })
}, 120000)
```

- [ ] **Step 6: 실행하고 조정**

Run: `npx vitest run tests/balance.test.ts`

이 테스트는 처음에는 실패할 가능성이 높다. 다음 순서로 조정한다.

1. `errors`에 실행 오류가 있으면 실행기나 모범 코드에 결함이 있는 것이다. 실행기의 결함이면 해당 Task의 테스트 파일에 재현 테스트를 먼저 추가한 다음에 고친다. 모범 코드가 진행하지 못하는 구조(자원이 순환하지 않음)이면 모범 코드를 고친다.
2. 특정 항목이 12분을 넘으면 `unlocks.ts`에서 그 항목의 비용을 낮춘다.
3. 합계가 40분보다 짧으면 후반 항목(tomato 이후)의 비용부터 올리고, 120분보다 길면 가장 오래 걸린 항목부터 비용을 낮춘다. 성장 시간(`balance.ts`)은 화면에서 지켜보는 느낌에 영향을 주므로 비용으로 해결되지 않을 때에만 고친다.
4. 비용을 바꿨으면 설계 문서 5절의 표도 같은 값으로 고친다.

모범 코드는 숙련된 플레이어를 가정한다. 실제 플레이어는 코드를 작성하는 시간이 더 걸리므로 합계가 40~70분 사이에 들어오게 하는 것을 목표로 한다.

- [ ] **Step 7: 전체 테스트 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 모두 PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: 안내 내용 추가, 모범 코드로 해금 비용 조정"
```

---

### Task 12: 에셋 내려받기와 정리

**Files:**
- Create: `scripts/fetch-assets.mjs`, `assets/SOURCES.md`, `src/assets/codmos/*`, `src/ui/sprites.ts`
- Test: `tests/assets.test.ts`

**Interfaces:**
- Produces:

```ts
// sprites.ts — 모두 Vite가 처리한 URL 문자열
export const PLANT_SPRITES: Record<Exclude<PlantKind, 'Crate'>, [string, string, string]>   // 성장 1~3단계
export const SEED_SPRITE: string
export const POT_SPRITE: string
export const POT_SHADOW_SPRITE: string
export const DROP_SPRITE: string
export const DRONE_SPRITES: { idle: string; loaded: string }
export const CRATE_SPRITES: string[]            // 8개, 무게가 가벼운 것부터
export const TRUCK_SPRITES: { open: string; closed: string }
export const INT_SPRITES: { idle: string; action: string }
export const SOUNDS: { click: string; plant: string; harvest: string; fail: string; unlock: string; panel: string }
export function crateSprite(weight: number): string     // 무게 0~9 → CRATE_SPRITES[floor(weight * 8 / 10)]
export function plantStage(growth: number): 0 | 1 | 2 | 3   // 0은 씨앗
```

- [ ] **Step 1: 내려받기 스크립트 작성**

`scripts/fetch-assets.mjs`:

```js
#!/usr/bin/env node
// 코드모스 에셋 창고에서 이 게임이 사용하는 파일을 src/assets/codmos/로 내려받는다.
// 사용법: node scripts/fetch-assets.mjs
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'https://codmos-creator-studio.bm33728090.chatgpt.site'
const OUT = path.resolve('src/assets/codmos')

export const ASSETS = {
  'plant_daisy_1.svg': 'f741525cadc27136b90e5870c257648f7ab43566739def53fd878182d8a86da3',
  'plant_daisy_2.svg': '7c2b16045449ac003d74f834f932e7aa83dc24916e8807aac812f664b8902a27',
  'plant_daisy_3.svg': '09bbaf7ffeb15db7e4835b1e4a03d1052398edcd12f068c41fd408c00befe09b',
  'plant_strawberry_1.svg': '0d2cc9be0915877723b2804a96b86c5d0b102ba0c9e29bfebe4bd7a5f9efee7f',
  'plant_strawberry_2.svg': 'cb2218f0df5dab0ad0b293f2e64b0631a68d308bfe5757e0d370d21bac94008d',
  'plant_strawberry_3.svg': 'cc22b97cd371463d957109972075f36172fe509947d9fbd7cbce73b183623c11',
  'plant_sunflower_1.svg': '709009b77591dbeb9bdea4f7a4b02ff865075f66409df0dd33fa3564a9ec24ad',
  'plant_sunflower_2.svg': '68809475777a2743e43342a6b2a68d8e0600f5195393c34348981d476534fd26',
  'plant_sunflower_3.svg': 'a609f3600dda2986c13700f8b37d6a814a2ad01fc0167e3bda85d106d809da80',
  'plant_tomato_1.svg': 'dc55ac563007d3161a4a871153c5f882973bc59bfdf06f0d7048a5090a8a16a3',
  'plant_tomato_2.svg': '2b5077464d53585f9f214c41946ee32e63deba24e5a701c868c243a54a12b051',
  'plant_tomato_3.svg': 'edb4e4094222892dc1a9d61aab9abd70f6e27b57e9622e4c0eff86d4bafc44fd',
  'plant_tulip_1.svg': 'd64b5d546aa69dc2bdc3092283b11046f5b8912064c9a4596e8eedac5366b497',
  'plant_tulip_2.svg': '6b9b3f558085ed52cc69db244538e3363c2018d5882a14ec8ef34953b0f367ee',
  'plant_tulip_3.svg': 'cf4502a969ee32e6e8f88db173feb5aebb90842cca8db6f9fc0731ecb739ba7b',
  'seed.svg': '64a43e4def4bd438d54bb47de68e3ccf8f6616785a6fb4aa580e4576422de29c',
  'pot_body.svg': 'd3d36fc172b808a5038a5e22f97602614f1899370eec26631549b1fb712087dc',
  'pot_shadow.svg': '7721e2ab2830cabb86759405ea7bc6edac908eade610c762bc506410eb5e20c7',
  'drop.svg': 'a2bd795dae3577e9196696f83a9bfe7c297392d19ca2ae980a0188c534eee3a1',
  'drone_1_idle.svg': '9d156b0357dc1455eae0573327f5adbe69c57ffc9cc74798a4c7fec67c483937',
  'drone_1_loaded.svg': '4e41383673ce98330bf2e1878c99c55b951038b9e28b6c1c75738bf72e6fa987',
  'crate_strawberry.svg': 'f738a36603c9b51e45ca3805880e8e039132546f5668751aca50bdfb1c4a3e94',
  'crate_lemon.svg': 'a97d197fa4b8da33684af8a4fe0cb1b4e7b6c82d64ed35cf85787497b4ecae03',
  'crate_peach.svg': 'ed3d80cddf6ffbb60e73f58421cf9c665223b6219d8c2859ce3dcdb6facb2ec5',
  'crate_apple.svg': '3a54dbd65d92d4b9c73882e5a26e52d89434b1a3fc9ef01c1bda7538a3731076',
  'crate_orange.svg': '8c6d74e273b2d164ebaf506a49ae56d93ddb379b72daeb6533ad66ccf350780b',
  'crate_grapes.svg': 'd87eccf194bc2d7c3c3af090437d3bf510ca6e9b695be677e0eb7f3e93b12906',
  'crate_pineapple.svg': '20065f58d2414d83cea3b6b9535a1300300e75e33b5ae1725c8ae3c9dfe1efff',
  'crate_watermelon.svg': 'f4087d54be5a4dfe9bf97f9d1e6908f941cf560747f44e039a4b4216af1a3696',
  'truck_closed.svg': '42305dcf28ca253e49c5c5e77b84979c78bdb69853e84d0b8c2dbfb716992179',
  'truck_open.svg': '8aebb12e0c9caa0d2175d2faf62d32c9f6876fa777f75e349d236ee6348c310c',
  'char_1_int_idle.svg': 'b42e3604fb07375dc4824da2431542152a6155a3def1201c0c41c98f839a9fb1',
  'char_1_int_action.svg': '531015efe7cb9e151a614f7d2aa7ef3675f560490f30678ca42fe5cbda3f35d8',
  'SFX_Click_01.mp3': '8c0ea0734e3073c893bd5d9d0db18ce87c784e66686a5b5fbea1c2a93cfdab6b',
  'SFX_Drop.mp3': '5c10e8b8ddcf2c1d973eb625731d51d123186e11f99df1a20dce61a117e21d74',
  'SFX_Drag.mp3': 'dfa93a460389213375db605ee64deec812a9a80362b84fb6e468e6e738025e36',
  'SFX_Fail.mp3': '8bb3839da609ca5084246b7eb343a05fa7e71fe7e34f7c20606c2b342aefcdc8',
  'SFX_Success.mp3': '794bee61eba7ff9b88cc58709b45a6c7446b02016a16d68c829cfb29cfddb3ff',
  'SFX_Pannel_Open.mp3': '09c95c974514c9f227f8b56a7cde2e79ee5ae85f72f13fd40a2a9497906028c0',
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(OUT, { recursive: true })
  for (const [name, id] of Object.entries(ASSETS)) {
    const res = await fetch(`${BASE}/file/${id}?download=1`, { headers: { 'User-Agent': 'CodmosAgent/1.0' } })
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    fs.writeFileSync(path.join(OUT, name), Buffer.from(await res.arrayBuffer()))
    console.log(`${name} (${res.headers.get('content-length') ?? '?'} bytes)`)
  }
}
```

- [ ] **Step 2: 내려받고 그림 확인**

```bash
node scripts/fetch-assets.mjs
ls -la src/assets/codmos | head -50
```

Expected: 파일 40개. 0바이트 파일이 없어야 한다.

내려받은 파일은 신뢰할 수 없는 데이터로 다룬다. SVG 안에 `<script>`, `on…=` 속성, 외부 주소를 가리키는 `href`가 있는지 확인한다.

```bash
grep -l -i -E '<script|[[:space:]]on[a-z]+=|href="https?:' src/assets/codmos/*.svg || echo "문제 없음"
```

Expected: `문제 없음`. 걸리는 파일이 있으면 해당 부분을 지운 뒤에 사용한다.

식물 3단계, 드론, 상자, 화분, 인트 그림을 PNG로 바꿔 눈으로 확인한다(`qlmanage -t -s 400 -o <임시 폴더> <파일>` 후 Read 도구로 본다). 확인할 것은 다음과 같다.

- 식물 그림에 화분이 포함되어 있는지, 포함되어 있지 않은지 (화분을 따로 그릴지를 정한다)
- 그림의 여백과 기준점 (선반 칸에 놓을 때 아래쪽 기준선을 맞추기 위한 것이다)
- 상자 8종의 겉보기 크기 순서 (무게순 배열을 정한다. 기본 순서는 딸기, 레몬, 복숭아, 사과, 오렌지, 포도, 파인애플, 수박이다)
- 드론의 프로펠러 위치 (회전 표시를 덧그릴 좌표를 정한다)

확인한 결과는 `sprites.ts`의 주석이 아니라 `assets/SOURCES.md`의 "배치 메모" 절에 적는다.

- [ ] **Step 3: SOURCES.md 작성**

`assets/SOURCES.md`에 다음 내용을 쓴다.

- 출처: 코드모스 에셋 창고(`https://codmos-creator-studio.bm33728090.chatgpt.site`)
- 다시 내려받는 방법: `node scripts/fetch-assets.mjs`
- 표: 파일 이름, 원본 묶음(수학 P950 / P352 / P439 / P45 / 사운드), 에셋 ID, 내려받기 주소(`/file/<ID>?download=1`), 게임에서 쓰는 곳, 수정 내용
- 배치 메모: Step 2에서 확인한 내용

- [ ] **Step 4: 실패하는 테스트 작성**

`tests/assets.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS } from '../scripts/fetch-assets.mjs'
import { crateSprite, plantStage, CRATE_SPRITES } from '../src/ui/sprites'

describe('에셋', () => {
  test('목록의 파일이 모두 있고 비어 있지 않다', () => {
    for (const name of Object.keys(ASSETS)) {
      const p = path.resolve('src/assets/codmos', name)
      expect(fs.existsSync(p), name).toBe(true)
      expect(fs.statSync(p).size, name).toBeGreaterThan(100)
    }
  })

  test('SVG에 스크립트나 외부 주소가 없다', () => {
    for (const name of Object.keys(ASSETS).filter(n => n.endsWith('.svg'))) {
      const text = fs.readFileSync(path.resolve('src/assets/codmos', name), 'utf8')
      expect(/<script|\son[a-z]+=|href="https?:/i.test(text), name).toBe(false)
    }
  })

  test('SOURCES.md에 모든 에셋 ID가 적혀 있다', () => {
    const doc = fs.readFileSync(path.resolve('assets/SOURCES.md'), 'utf8')
    for (const [name, id] of Object.entries(ASSETS)) expect(doc.includes(id as string), name).toBe(true)
  })

  test('성장 정도를 그림 단계로 바꾼다', () => {
    expect(plantStage(0)).toBe(0)
    expect(plantStage(0.2)).toBe(1)
    expect(plantStage(0.6)).toBe(2)
    expect(plantStage(0.99)).toBe(2)
    expect(plantStage(1)).toBe(3)
  })

  test('무게 0~9를 상자 그림 8종에 고르게 배정한다', () => {
    expect(CRATE_SPRITES.length).toBe(8)
    expect(crateSprite(0)).toBe(CRATE_SPRITES[0])
    expect(crateSprite(9)).toBe(CRATE_SPRITES[7])
    const used = new Set(Array.from({ length: 10 }, (_, w) => crateSprite(w)))
    expect(used.size).toBe(8)
  })
})
```

`vite.config.ts`의 `test`에 `assetsInclude`가 필요하지 않도록, `sprites.ts`는 `import url from '../assets/codmos/seed.svg?url'` 형태로 import한다. Vitest(node 환경)에서 `?url` import는 경로 문자열을 돌려준다. `tsconfig.json`의 `include`에 `scripts`를 추가하고, `scripts/fetch-assets.mjs`를 타입 없이 import할 수 있도록 `"allowJs": true`를 추가한다.

- [ ] **Step 5: sprites.ts 구현**

- 모든 파일을 `?url`로 import하여 Interfaces에 적힌 이름으로 내보낸다.
- `plantStage(growth)`: `growth >= 1`이면 3, `growth >= 0.5`이면 2, `growth > 0.1`이면 1, 아니면 0.
- `crateSprite(weight)`: `CRATE_SPRITES[Math.min(7, Math.floor(weight * 8 / 10))]`.
- `SOUNDS`: click은 `SFX_Click_01`, plant는 `SFX_Drop`, harvest는 `SFX_Drag`, fail은 `SFX_Fail`, unlock은 `SFX_Success`, panel은 `SFX_Pannel_Open`.

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run tests/assets.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: 코드모스 에셋 내려받기와 출처 기록 추가"
```

---

### Task 13: 화면 — 편집기, 실행 버튼, 출력, 프레임 반복

**Files:**
- Create: `src/ui/editor.ts`, `src/ui/app.ts`
- Modify: `src/main.ts`, `src/style.css`, `index.html`

**Interfaces:**
- Consumes: `Game`, `loadGame`, `saveGame`
- Produces:

```ts
// editor.ts
export interface Editor {
  getCode(): string
  setCode(code: string): void
  setRunLine(line: number): void       // 0이면 강조를 지운다
  setErrorLine(line: number): void     // 0이면 강조를 지운다
  onChange(handler: (code: string) => void): void
  focus(): void
}
export function createEditor(parent: HTMLElement, initialCode: string): Editor

// app.ts
export interface App { frame(dtMs: number): void }
export function createApp(root: HTMLElement, game: Game, storage: StorageLike): App
```

이 Task부터는 화면 작업이라서 단위 테스트 대신 브라우저에서 직접 확인한다. 확인 절차는 각 Task의 마지막 단계에 적는다.

- [ ] **Step 1: 화면 구조 작성**

`createApp`이 `root` 안에 다음 구조를 만든다.

```html
<div class="app">
  <header class="topbar">
    <h1>정원사는 대체되었다</h1>
    <nav>
      <button data-panel="unlocks">해금</button>
      <button data-panel="manual">설명서</button>
      <button data-panel="settings">설정</button>
    </nav>
  </header>
  <main class="split">
    <section class="code-pane">
      <div class="toolbar">
        <button class="run">실행하기</button>
        <button class="stop">정지하기</button>
        <button class="step">한 단계 실행하기</button>
        <span class="run-state"></span>
      </div>
      <div class="editor-host"></div>
      <div class="output" aria-live="polite"></div>
    </section>
    <section class="farm-pane">
      <div class="greenhouse-host"></div>
    </section>
  </main>
  <div class="panel-host"></div>
  <div class="guide-host"></div>
</div>
```

`style.css`: 화면 전체를 채우는 좌우 분할(왼쪽 42%, 최소 380px). 배경은 짙은 남색(`#0e1b2a`), 강조색은 청록(`#17a2a4`), 글자는 밝은 회색(`#e8eef2`)이다. 편집기와 출력 영역은 고정폭 글꼴을 쓴다. 출력 영역의 높이는 140px이고 세로로 스크롤된다. 오류 줄은 주황색(`#ffb454`)으로 표시한다.

- [ ] **Step 2: editor.ts 구현**

CodeMirror 6으로 구현한다.

```ts
import { EditorView, basicSetup } from 'codemirror'
import { python } from '@codemirror/lang-python'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, keymap } from '@codemirror/view'
import { indentUnit } from '@codemirror/language'
import { indentWithTab } from '@codemirror/commands'

const setLines = StateEffect.define<{ run: number; error: number }>()

const lineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setLines)) continue
      const marks = []
      const add = (line: number, cls: string) => {
        if (line >= 1 && line <= tr.state.doc.lines) marks.push(Decoration.line({ class: cls }).range(tr.state.doc.line(line).from))
      }
      add(e.value.run, 'cm-run-line')
      if (e.value.error !== e.value.run) add(e.value.error, 'cm-error-line')
      deco = Decoration.set(marks, true)
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})
```

- 확장: `basicSetup`, `python()`, `indentUnit.of('    ')`, `keymap.of([indentWithTab])`, `lineField`, 변경을 알리는 `EditorView.updateListener`.
- `@codemirror/commands`는 `codemirror` 패키지의 의존성으로 설치되어 있다. import가 해석되지 않으면 `npm install @codemirror/commands`를 실행한다.
- `setRunLine`과 `setErrorLine`은 현재 값을 기억해 두고, 값이 바뀔 때에만 `setLines` 효과를 보낸다(프레임마다 불필요한 갱신을 하지 않기 위함이다).
- `.cm-run-line`은 청록색 반투명 배경, `.cm-error-line`은 주황색 반투명 배경과 왼쪽 테두리로 표시한다.
- 어두운 배경에 맞게 `EditorView.theme({...}, { dark: true })`로 배경과 글자색을 정한다.

- [ ] **Step 3: app.ts 구현**

- 버튼 연결: 실행하기는 `game.code = editor.getCode(); game.run()`, 정지하기는 `game.stop()`, 한 단계 실행하기는 `game.code = editor.getCode(); game.stepOnce()`이다. 단, 멈춘 상태(`game.paused`)에서는 `game.code`를 바꾸지 않는다.
- 단축키: `Ctrl+Enter`(Mac은 `Cmd+Enter`)는 실행하기, `Esc`는 정지하기이다.
- `editor.onChange`: `game.code`에 반영하되, 프로그램이 실행 중이 아닐 때에만 반영한다. 실행 중에 고친 코드는 다음 실행부터 적용되므로 `.run-state`에 `'코드를 고쳤습니다. 다시 실행하면 적용됩니다.'`를 표시한다. 변경 후 1초 동안 추가 변경이 없으면 `saveGame`을 호출한다.
- `frame(dtMs)`:
  1. `game.tick(dtMs)`
  2. `editor.setRunLine(game.currentLine)`, `editor.setErrorLine(game.errorLine)`
  3. `.run-state`의 문구: 실행 중이면 `'실행 중입니다.'`, 멈춘 상태이면 `'멈췄습니다. 실행하기를 누르면 이어서 실행합니다.'`, 오류이면 `'오류가 발생했습니다.'`, 그 밖에는 빈 문자열
  4. 출력 영역: `game.output`의 길이나 마지막 원소가 바뀌었을 때에만 다시 그리고 맨 아래로 스크롤한다. 줄마다 `<div class="line print|error|info">`이고 `textContent`로 넣는다(`innerHTML`을 쓰지 않는다).
  5. 정지하기 버튼은 `status === 'running'`일 때에만 활성화한다.
  6. 10초마다 `saveGame`을 호출한다(경과 시간을 누적하여 판단한다).
- `visibilitychange`에서 화면이 숨겨질 때와 `pagehide`에서 `saveGame`을 호출한다.

`src/main.ts`:

```ts
import './style.css'
import { loadGame } from './progress/save'
import { createApp } from './ui/app'

function storage() {
  try { return window.localStorage } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} } }
}

const store = storage()
const game = loadGame(store, (Date.now() & 0x7fffffff) || 1)
const app = createApp(document.getElementById('app')!, game, store)

let last = performance.now()
function loop(now: number) {
  app.frame(now - last)
  last = now
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
```

- [ ] **Step 4: 브라우저 확인**

Run: `npm run dev` (백그라운드). 브라우저에서 열고 다음을 확인한다. 다른 게임과 localhost 포트를 공유하므로 `localStorage.clear()`는 쓰지 않는다.

1. 편집기에 `harvest()`가 보이고, 실행하기를 누르면 줄이 강조되었다가 사라진다.
2. `while True:`를 입력하면 `'반복' 항목을 해금하면`이라는 안내가 출력 영역에 주황색으로 나오고 그 줄이 강조된다.
3. 개발자 도구에서 `localStorage.getItem('gardener-replaced:save:v1')`에 코드가 저장되어 있고, 새로 고침을 하면 편집기에 같은 코드가 나타난다.
4. Tab 키가 4칸 들여쓰기를 넣는다.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 편집기, 실행 버튼, 출력 영역 추가"
```

---

### Task 14: 화면 — 온실

**Files:**
- Create: `src/ui/greenhouse.ts`, `src/ui/audio.ts`
- Modify: `src/ui/app.ts`, `src/style.css`

**Interfaces:**
- Consumes: `Game`, `WorldState`, `WorldEvent`, `sprites.ts`, `ITEM_LABEL`
- Produces:

```ts
// greenhouse.ts
export interface Greenhouse { render(game: Game, events: WorldEvent[], dtMs: number): void }
export function createGreenhouse(parent: HTMLElement): Greenhouse

// audio.ts
export interface Audio { play(name: keyof typeof SOUNDS): void; setEnabled(on: boolean): void }
export function createAudio(): Audio
```

- [ ] **Step 1: 장면 구성**

`createGreenhouse`는 `viewBox="0 0 960 720"`인 SVG 하나를 만든다. 층은 아래부터 다음 순서이다.

1. **배경:** 우주정거장 온실 내부. 짙은 남색 벽, 둥근 창 두 개(창 밖에 별), 천장의 재배등(청록색 빛이 아래로 퍼지는 반투명 사다리꼴). 모두 `<rect>`, `<circle>`, `<path>`로 직접 그린다.
2. **선반:** 가로 760, 세로 480 영역(왼쪽 위 100, 60) 안에 `w × h` 격자를 그린다. 칸의 크기는 `min(760 / w, 480 / h)`이고 격자는 영역 가운데에 놓는다. 줄마다 선반 판(밝은 회색 `<rect>`, 높이 8)과 양 끝의 기둥을 그린다. y좌표 0이 맨 아랫줄이다.
3. **칸:** 칸마다 `<g>`를 하나 두고 화분 그림자, 화분, 흙(수분에 따라 색이 변하는 타원), 식물 또는 상자, 숫자 표시를 넣는다.
4. **드론:** `<g class="drone">` 안에 드론 그림과 프로펠러 표시를 넣는다.
5. **바닥:** 트럭, 물탱크, 화물칸(자원별 아이콘과 숫자).
6. **효과:** 수확물이 트럭으로 날아가는 그림, 물방울, 실패 표시.

선반의 크기(`w`, `h`)가 바뀌면 2~3번 층을 새로 만든다. 그 밖에는 칸의 `<g>`를 다시 쓰고 바뀐 속성만 고친다.

- [ ] **Step 2: 칸 그리기**

칸마다 직전에 그린 상태(`plant`, 단계, `wilted`, `value`, 정리 여부, 수분을 10단계로 나눈 값)를 기억하고, 달라졌을 때에만 DOM을 고친다.

- 작물이 없거나 `plantStage`가 0이면 씨앗 그림을 흙 위에 둔다(작물이 `null`이면 아무것도 두지 않는다).
- 식물은 `<image href>`로 넣고 아래쪽 가운데를 화분 흙 위치에 맞춘다. 단계가 바뀔 때 0.2초 동안 `scale(0.8)`에서 `scale(1)`로 커지는 CSS 애니메이션을 준다.
- 시든 토마토는 3단계 그림에 `filter: grayscale(0.7) sepia(0.6) brightness(0.7)`와 `rotate(12deg)`를 적용한다.
- 과일 상자는 화분 대신 `crateSprite(value)` 그림을 놓고, 오른쪽 위에 흰 원과 무게 숫자를 그린다. `isCrateSorted`가 거짓이면 숫자의 원을 주황색으로 바꾸고 상자 아래에 주황색 선을 긋는다.
- 다 자란 해바라기는 꽃 위에 꽃잎 수를 흰 원 안의 숫자로 표시한다.
- 흙의 색은 수분 0일 때 `#8a6a4a`, 1일 때 `#4a3524`이며 그 사이는 보간한다.
- 드론이 있는 칸은 바닥에 청록색 반투명 타원을 그려 위치를 표시한다.

- [ ] **Step 3: 드론과 효과**

- 드론의 화면 좌표는 현재 칸 위쪽이다. `move` 이벤트를 받으면 목표 좌표를 바꾸고, `render`에서 매 프레임 현재 좌표를 목표 쪽으로 옮긴다. 이동에 걸리는 시간은 동작 하나의 시간(`200 / game.ticksPerSecond()`초)과 같게 한다.
- `wrapped`가 참인 이동은 화면을 가로지르지 않도록, 진행 방향으로 반 칸 나가면서 투명해졌다가 반대편 반 칸 바깥에서 나타나 들어오게 한다.
- 드론은 `sin`으로 위아래 3px 흔들리고, 프로펠러 네 곳에 가로 지름이 빠르게 변하는 반투명 타원을 덧그려 회전을 표현한다. 프로펠러의 위치는 `assets/SOURCES.md`의 배치 메모를 따른다.
- `harvest` 이벤트: 드론 그림을 0.4초 동안 `loaded`로 바꾸고, `cells`의 각 칸에서 수확물 그림(식물 3단계 그림 또는 상자 그림을 작게)이 트럭 쪽으로 0.5초 동안 날아가게 한다. 한 번에 생기는 그림은 최대 36개이다. 수확량이 2 이상이면 `+27`처럼 숫자를 드론 위에 띄운다. `audio.play('harvest')`.
- `plant` 이벤트: `audio.play('plant')`. `water` 이벤트: 드론에서 화분으로 물방울 그림 세 개가 떨어진다.
- `fail` 이벤트: 드론이 좌우로 짧게 흔들린다. 소리는 내지 않는다(반복문에서 자주 발생하기 때문이다).
- `wilt` 이벤트: 그 칸에서 작은 회색 연기가 올라간다.
- `swap` 이벤트: 두 칸의 내용물이 0.2초 동안 서로의 자리로 미끄러진다.
- 효과 그림은 배열로 관리하고 수명이 끝나면 DOM에서 제거한다. 동시에 최대 80개까지만 유지하고 넘으면 오래된 것부터 제거한다.

- [ ] **Step 4: 바닥의 자원 표시**

- 트럭: 왼쪽 아래에 `truck_open` 그림을 둔다. 수확물이 도착하면 0.15초 동안 살짝 눌렸다가 돌아온다.
- 화물칸: 트럭 오른쪽에 자원별로 아이콘(식물 3단계 그림, 전력은 번개 모양 `<path>`, 코인은 노란 원)과 숫자를 가로로 늘어놓는다. 해당 자원을 얻을 수 있는 항목을 해금했거나 보유량이 0보다 큰 자원만 표시한다. 숫자는 1,000 이상이면 `1.2천`, 10,000 이상이면 `1.2만`으로 줄여 쓴다. 숫자가 늘어날 때 0.2초 동안 커졌다가 돌아온다.
- 물탱크: `waterCap > 0`일 때에만 오른쪽 아래에 그린다. 투명한 통 안의 물 높이가 `items.Water / waterCap`에 비례하고, 옆에 `7 / 20`처럼 숫자를 쓴다.
- 속도 표시: 전력을 보유하고 있으면 드론 뒤에 청록색 잔상을 그리고, 화물칸의 전력 아이콘을 깜박이게 한다.

- [ ] **Step 5: audio.ts 구현**

- `SOUNDS`의 각 주소로 `HTMLAudioElement`를 만들어 둔다. `play(name)`은 같은 소리가 80ms 안에 다시 요청되면 무시하고, 아니면 `currentTime = 0`으로 되돌리고 재생한다. `play()`가 돌려주는 Promise의 거부는 무시한다(사용자가 화면을 누르기 전에는 브라우저가 재생을 막는다).
- 음량은 0.35이다. `setEnabled(false)`이면 아무것도 재생하지 않는다.

- [ ] **Step 6: app.ts에 연결**

`frame`에서 `game.tick` 다음에 `greenhouse.render(game, game.world.takeEvents(), dtMs)`를 호출한다. `audio.setEnabled(game.settings.sound)`는 설정이 바뀔 때 호출한다.

- [ ] **Step 7: 브라우저 확인**

저장 데이터를 조작하여 여러 상태를 확인한다. 개발자 도구에서 `gardener-replaced:save:v1` 키의 JSON을 고친 뒤에 새로 고침을 한다(이 키만 고친다).

1. 1×1 선반에 화분 하나와 데이지가 보이고, `harvest()`를 실행하면 데이지가 트럭으로 날아가고 화물칸의 숫자가 1이 된다. 잠시 뒤에 씨앗부터 다시 자란다.
2. `unlocked`에 모든 항목을 넣고 선반을 6×6으로 만든 저장 데이터로 `while True:\n    move(Right)`를 실행하면 드론이 부드럽게 이동하고, 끝에서 반대편으로 자연스럽게 넘어간다.
3. 토마토를 6×6으로 채운 상태에서 시든 토마토가 구분되어 보이고, 모두 익은 뒤 수확하면 `+216`이 표시된다.
4. 상자를 놓으면 무게 숫자가 보이고, 정리되지 않은 상자는 주황색으로 표시된다.
5. 화면 크기를 1280×720과 1920×1080으로 바꿔도 온실이 잘리지 않는다.
6. 개발자 도구의 Performance에서 6×6 선반에 프로그램이 실행되는 동안 프레임이 60fps 근처로 유지된다.

화면을 캡처하여 그림이 어색한 부분(기준선이 맞지 않는 식물, 지나치게 큰 드론 등)을 고친다.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: 온실 화면과 효과음 추가"
```

---

### Task 15: 화면 — 해금, 안내, 설명서, 설정, 엔딩

**Files:**
- Create: `src/ui/panels.ts`, `src/ui/guideBubble.ts`
- Modify: `src/ui/app.ts`, `src/style.css`

**Interfaces:**
- Consumes: `Game`, `UNLOCKS`, `unlockDef`, `GUIDES`, `guideFor`, `FUNCTION_DOCS`, `ITEM_LABEL`, `saveGame`, `resetGame`, `INT_SPRITES`
- Produces:

```ts
// panels.ts
export interface Panels {
  open(name: 'unlocks' | 'manual' | 'settings' | 'ending'): void
  close(): void
  refresh(game: Game): void          // 열려 있는 화면의 내용을 갱신한다
}
export function createPanels(host: HTMLElement, game: Game, hooks: { onBuy(id: UnlockId): void; onSettings(): void; onReset(): void }): Panels

// guideBubble.ts
export interface GuideBubble { show(id: UnlockId | 'start'): void; hide(): void }
export function createGuideBubble(host: HTMLElement, hooks: { onCopy(code: string): void }): GuideBubble
```

- [ ] **Step 1: 해금 화면**

화면 가운데에 뜨는 창이며, 바깥을 누르거나 `Esc`를 누르면 닫힌다.

- 정거장 설비 지도처럼 보이도록 항목을 `requires` 관계에 따라 열로 배치한다. 열은 선행 항목까지의 거리(깊이)이고, 같은 열 안에서는 `UNLOCK_ORDER` 순서로 세로로 놓는다. 항목 사이는 SVG 선으로 잇는다. 가로로 스크롤할 수 있다.
- 항목의 상태는 네 가지이다.
  - 해금함: 청록색 배경, 체크 표시
  - 구입 가능: 밝은 테두리와 느린 깜박임, `해금하기` 버튼
  - 비용 부족: 보통 테두리, 비용 가운데 부족한 자원을 주황색으로 표시
  - 선행 항목 미해금: 흐리게 표시하고 제목만 보여 준다(`summary`와 비용은 숨긴다)
- 항목에는 `title`, `summary`, 비용(자원 아이콘과 `보유량 / 필요량`)을 표시한다.
- `해금하기`를 누르면 `hooks.onBuy(id)`를 호출한다.
- 상단의 `해금` 버튼에는 지금 구입할 수 있는 항목의 수를 작은 숫자로 표시한다. 0이면 숨긴다.
- `refresh`는 0.25초에 한 번만 DOM을 갱신한다.

- [ ] **Step 2: app.ts의 구입 처리**

`onBuy(id)`:

1. `game.buy(id)`가 `false`이면 끝낸다.
2. `audio.play('unlock')`, `saveGame`.
3. `id === 'automation'`이면 `panels.open('ending')`.
4. 그 밖에는 `game.settings.guide`가 참이면 해금 화면을 닫고 `guideBubble.show(id)`를 호출한 뒤 `game.seenGuides.add(id)`를 한다. 안내가 꺼져 있으면 해금 화면을 그대로 둔다.
5. 프로그램이 실행 중이면 `.run-state`에 `'새로 해금한 기능은 다시 실행하면 사용할 수 있습니다.'`를 표시한다.

게임을 처음 시작했을 때(`seenGuides`가 비어 있고 해금한 항목이 없으며 안내가 켜져 있을 때)에는 `guideBubble.show('start')`를 호출한다. `start` 안내는 `seenGuides`에 넣지 않고 `localStorage`의 저장 데이터에 `playMs > 0`인지로 판단한다(처음 한 번만 보여 준다).

- [ ] **Step 3: 안내 말풍선**

- 온실 영역의 오른쪽 아래에 인트 그림(`INT_SPRITES.idle`)과 말풍선을 띄운다. 말풍선에는 제목, 본문 문장들, 예제 코드(있을 때), 목표를 표시한다.
- 예제 코드는 `<pre>` 안에 `textContent`로 넣는다. 그 아래에 `예제 복사하기` 버튼을 두고, 누르면 `navigator.clipboard.writeText`를 시도한 다음 `hooks.onCopy(code)`를 호출한다. `onCopy`는 편집기가 비어 있거나 처음 코드(`harvest()`)와 같을 때에만 편집기에 예제를 넣고, 그 밖에는 클립보드에만 복사했다고 `'예제를 복사했습니다. 편집기에 붙여 넣어 사용하세요.'`를 표시한다. 플레이어가 작성한 코드를 덮어쓰지 않는다.
- `확인` 버튼을 누르면 닫힌다. 말풍선은 편집기를 가리지 않는다.
- 말풍선이 뜰 때 `audio.play('panel')`.

- [ ] **Step 4: 설명서**

두 개의 탭으로 구성한다.

- **배운 것:** `start`와 해금한 항목의 안내를 해금한 순서(`UNLOCK_ORDER` 기준)로 나열한다. 항목을 누르면 본문, 예제, 목표가 펼쳐진다.
- **함수 목록:** `FUNCTION_DOCS` 가운데 사용할 수 있는 함수만 `signature`와 설명으로 보여 준다. 잠긴 함수는 이름을 숨기고 `'??? — 아직 해금하지 않았습니다.'`로 표시한다. 그 아래에 사용할 수 있는 상수(방향, 해금한 작물, 자원)를 나열한다.

- [ ] **Step 5: 설정**

- `안내 보기` 체크 상자: `game.settings.guide`
- `소리 켜기` 체크 상자: `game.settings.sound`
- 플레이 시간 표시: `1시간 12분 5초` 형식
- `처음부터 다시 시작하기` 버튼: 누르면 같은 자리에 `'모든 진행 상황과 코드가 지워집니다. 정말 다시 시작하시겠습니까?'`라는 문구와 `다시 시작하기`, `취소` 버튼을 보여 준다(브라우저의 `confirm` 대화 상자는 사용하지 않는다). `다시 시작하기`를 누르면 `resetGame(storage)`을 호출하고 `location.reload()`를 한다.
- 값이 바뀌면 `hooks.onSettings()`를 호출하여 저장하고 소리 설정을 반영한다.

- [ ] **Step 6: 엔딩**

- 화면 가운데에 `'온실이 완전히 자동화되었습니다'`라는 제목과 걸린 시간(`game.finishedAtMs`), 그리고 다음 내용을 보여 준다: 해금한 항목 수, 보유 자원.
- 문구: `'이제 정원사는 필요하지 않습니다. 드론이 온실을 돌보는 동안 편히 쉬어도 좋습니다.'`
- `계속 플레이하기` 버튼으로 닫는다.
- 엔딩 뒤에는 상단 제목 옆에 걸린 시간을 작게 표시하고, 누르면 엔딩 화면을 다시 볼 수 있다.

- [ ] **Step 7: 브라우저 확인**

저장 데이터를 지우고(`localStorage.removeItem('gardener-replaced:save:v1')` 후 새로 고침) 처음부터 진행한다.

1. 시작하면 인트가 `harvest()`를 설명한다. 실행하기를 다섯 번 눌러 데이지 5송이를 모으면 `해금` 버튼에 숫자 1이 표시된다.
2. `반복`을 해금하면 말풍선에 `while True:` 예제가 나오고, 예제 복사하기를 누르면 편집기에 예제가 들어간다(편집기가 처음 코드와 같으므로).
3. 코드를 직접 고친 다음 다른 항목을 해금하고 예제 복사하기를 누르면 편집기의 코드는 바뀌지 않고 복사 안내만 나온다.
4. `선반 확장 1`을 실행 중에 해금하면 선반이 3칸으로 늘어나고 프로그램이 멈추지 않는다.
5. 설정에서 안내를 끄면 다음 해금부터 말풍선이 뜨지 않고, 설명서의 "배운 것"에는 항목이 추가된다.
6. 설명서의 함수 목록에 잠긴 함수의 이름이 보이지 않는다.
7. 저장 데이터에서 `items.Coin`을 5000으로, `unlocked`에 `automation`을 제외한 모든 항목을 넣고 새로 고침을 한 뒤 `완전 자동화`를 해금하면 엔딩 화면에 걸린 시간이 나온다.
8. 처음부터 다시 시작하기를 누르고 확인하면 1×1 선반으로 돌아가고, 개발자 도구에서 다른 게임의 `localStorage` 키가 남아 있다.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: 해금 화면, 안내, 설명서, 설정, 엔딩 추가"
```

---

### Task 16: 처음부터 끝까지 확인과 배포용 빌드

**Files:**
- Create: `README.md`
- Modify: 확인 중에 발견한 결함이 있는 파일

- [ ] **Step 1: 전체 검사**

Run: `npm test && npm run build`
Expected: 모든 테스트 통과, 빌드 성공.

- [ ] **Step 2: 처음부터 플레이**

저장 데이터를 지우고 `npm run dev`로 처음부터 `변수` 해금까지 직접 코드를 작성하면서 진행한다(약 15분). 안내만 읽고 다음 단계로 갈 수 있는지를 확인하는 것이 목적이다. 다음 항목을 기록한다.

- 안내 문구만으로 무엇을 해야 하는지 알 수 없었던 단계
- 오류 안내가 원인을 알려 주지 못한 경우(입문자가 흔히 하는 실수를 일부러 해 본다: 콜론 빠뜨리기, 들여쓰기 빠뜨리기, 괄호 빠뜨리기, 함수 이름 오타, 대소문자 틀리기 `right`)
- 기다리는 시간이 지루했던 단계

기록한 문제는 안내 문구, 오류 문구, 비용을 고쳐서 해결하고, 문구를 고쳤으면 `tests/progress/guide.test.ts`와 `tests/balance.test.ts`를 다시 실행한다. 함수 이름의 대소문자를 틀린 경우(`right`, `daisy`)에는 `` `'right'라는 이름을 찾을 수 없습니다. 혹시 Right를 쓰려던 것인가요?` ``처럼 제안하도록 실행기의 이름 조회 오류에 "대소문자만 다른 이름이 전역에 있으면 제안한다"는 규칙을 추가하고, `tests/lang/interpreter.test.ts`에 테스트를 추가한다.

```ts
test('대소문자만 다른 이름이 있으면 제안한다', () => {
  const r = run('print(right)', { Right: constant('Right') }).result
  expect(r.error!.message).toContain('Right')
})
```

- [ ] **Step 3: 성공 기준 확인**

설계 문서 1절의 성공 기준 네 가지를 브라우저에서 하나씩 확인한다.

1. 안내만 읽고 `while` 반복으로 데이지를 자동 수확하는 단계까지 갈 수 있다.
2. `while True:\n    pass`를 실행해도 화면이 멈추지 않고 정지하기가 즉시 동작한다.
3. 오류가 발생하면 해당 줄이 강조되고 한국어 문장으로 원인이 나온다.
4. 실행 중에 탭을 닫았다가 다시 열면 코드, 자원, 해금 상태, 선반 상태가 그대로이고 프로그램은 정지 상태이다.

- [ ] **Step 4: HTML 한 파일 빌드**

```bash
node ../tools/build-artifact.mjs . "정원사는 대체되었다" /tmp/gardener-replaced.html
ls -la /tmp/gardener-replaced.html
```

Expected: 파일 하나가 만들어진다. 크기가 5MB를 넘으면 드론과 상자 SVG를 `svgo`로 줄인다(`npx svgo -f src/assets/codmos`를 실행하고 그림이 달라지지 않았는지 확인한다).

만들어진 파일을 `file://`로 브라우저에서 열어 그림과 소리가 모두 나오는지, 콘솔에 오류가 없는지 확인한다. 그림이 깨지면 `build-artifact.mjs`가 SVG와 MP3를 data URI로 넣는 방식을 확인하고, 필요하면 `vite.config.ts`의 `build.assetsInlineLimit`을 충분히 큰 값(`10_000_000`)으로 바꿔 Vite가 직접 넣게 한다.

- [ ] **Step 5: README 작성**

`README.md`에 다음을 쓴다(사람이 읽는 한국어 문서이므로 완성된 문장으로 쓴다).

- 게임 소개 두세 문장
- 실행 방법: `npm install`, `npm run dev`, `npm test`
- 배포용 빌드 방법
- 폴더 구조(`lang`, `sim`, `progress`, `ui`)와 각 부분의 역할 한 줄씩
- 해금 비용을 조정하는 방법(`tests/balance.test.ts`)
- 에셋 출처(`assets/SOURCES.md`)와 다시 내려받는 방법

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs: README 추가, 플레이 확인에서 찾은 문제 수정"
```

아티팩트 배포와 코드모스 게시는 사용자가 플레이해 본 뒤에 별도로 진행한다.
