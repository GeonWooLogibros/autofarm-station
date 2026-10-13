import type { BinOp, CmpOp, Expr, Stmt } from './ast'
import { HostError, LangError } from './errors'
import { KEYWORDS } from './lexer'
import { type Value, type HostFunc, type PyDict, type PyFunc, type PyList, type PyTuple, truthy, equals, keyOf, repr, typeName } from './values'

export interface StepResult { status: 'running' | 'done' | 'error'; line: number; error?: LangError }

// 실행기가 바깥으로 내보내는 틱 비용. stmt는 "문장 하나를 시작한다"는 표시이다.
interface Tick { ticks: number; stmt: boolean }
type Gen<T> = Generator<Tick, T, void>

// 문장이 평소와 다르게 끝난 경우. null이면 다음 문장으로 넘어간다.
type Completion =
  | null
  | { t: 'break' | 'continue'; line: number }
  | { t: 'return'; value: Value; line: number }

interface Frame { locals: Map<string, Value>; globalNames: Set<string> }

const MAX_DEPTH = 200          // 함수 호출 깊이
const MAX_EXPR_DEPTH = 200     // 식 하나가 겹칠 수 있는 깊이. 구문 분석기가 허용하는 연쇄 길이(100)보다 넉넉하다.
const MAX_SIZE = 10000         // 이어 붙여 만들 수 있는 리스트와 문자열의 길이. range()의 한도와 같다.
const TOO_COMPLEX = '식이 너무 복잡합니다. 여러 줄로 나누어 써 주세요.'
const UNEXPECTED = '실행 중에 예상하지 못한 문제가 발생했습니다. 코드를 조금 바꿔서 다시 실행해 주세요.'

const STMT_TICK: Tick = { ticks: 1, stmt: true }
const LOOP_TICK: Tick = { ticks: 1, stmt: false }

// 리스트 메서드와 인자 개수의 범위
const LIST_METHODS = new Map<string, [number, number]>([
  ['append', [1, 1]], ['pop', [0, 1]], ['insert', [2, 2]], ['remove', [1, 1]],
])

function isSeq(v: Value): v is PyList | PyTuple {
  return v !== null && typeof v === 'object' && (v.k === 'list' || v.k === 'tuple')
}

// JS 호출 깊이가 넘쳤을 때 엔진이 던지는 오류인지 본다. Chrome과 Safari는 RangeError를,
// Firefox는 InternalError('too much recursion')를 던진다.
function isStackOverflow(e: unknown): boolean {
  if (e instanceof RangeError) return true
  return e instanceof Error && (e.name === 'InternalError' || e.message.includes('too much recursion'))
}

function isDict(v: Value): v is PyDict {
  return v !== null && typeof v === 'object' && v.k === 'dict'
}

function isFunction(v: Value): v is PyFunc | HostFunc {
  return v !== null && typeof v === 'object' && (v.k === 'func' || v.k === 'host')
}

export class Program {
  private gen: Gen<void>
  private credit = 0
  private finished: StepResult | null = null
  private frames: Frame[] = []
  private exprDepth = 0
  private current = 0
  private started = false
  private lastWasStmt = false

  // 문장이나 반복의 조건 확인이 시작될 때마다 그 줄 번호를 알린다. 화면이 즉시 끝나는 줄도 보여 주는 데 쓴다.
  onLine: ((line: number) => void) | null = null

  // knownNames는 값은 없지만 이름 조회 오류에서 제안할 수 있는 이름이다(아직 해금하지 않은 함수 등).
  constructor(ast: Stmt[], private globals: Map<string, Value>, private knownNames: Iterable<string> = []) {
    this.gen = this.runTop(ast)
  }

  // 지금 실행 중인 줄
  get line(): number { return this.current }

  private begin(line: number): void {
    this.current = line
    this.onLine?.(line)
  }

  // 틱 예산만큼 실행한다. 동작 하나가 예산보다 비싸면 곧바로 실행하고, 모자란 틱은 다음 호출에서 갚는다.
  step(ticks: number): StepResult {
    if (this.finished) return this.finished
    this.credit = Math.min(this.credit + ticks, ticks)   // 남은 예산을 쌓아 두지 않는다
    while (this.credit > 0) {
      const r = this.advance()
      if (r) return r
    }
    return { status: 'running', line: this.current }
  }

  // 이미 실행한 동작의 값으로 아직 치르지 않은 틱. 없으면 0이다.
  get debt(): number { return this.credit < 0 ? -this.credit : 0 }

  // 빚을 호출한 쪽으로 넘기고 0으로 만든다. 동작 시간은 프로그램이 끝나거나 바뀌어도 드론에게 남아야 하기 때문이다.
  takeDebt(): number {
    const debt = this.debt
    if (debt > 0) this.credit = 0
    return debt
  }

  // 문장 하나만 실행하고, 다음 문장을 시작하기 직전에 멈춘다. 그 문장의 틱은 빚으로 쌓인다.
  stepStatement(): StepResult {
    if (this.finished) return this.finished
    if (this.credit > 0) this.credit = 0
    // 문장은 시작 표시를 낸 뒤에 실행된다. 그래서 프로그램을 처음 진행시킬 때에는 표시를 두 번 받아야
    // 첫 문장이 끝나고, 그 뒤로는 표시를 한 번 받을 때마다 실행 중이던 문장이 끝난다.
    let starts = this.started ? 1 : 0
    for (;;) {
      const r = this.advance()
      if (r) return r
      if (this.lastWasStmt && ++starts >= 2) return { status: 'running', line: this.current }
    }
  }

  // 제너레이터를 한 번 진행시킨다. 끝났거나 오류이면 StepResult를, 아니면 null을 돌려준다.
  private advance(): StepResult | null {
    this.started = true
    let r: IteratorResult<Tick, void>
    try {
      r = this.gen.next()
    } catch (e) {
      // 무엇이 던져졌든 프로그램을 오류로 끝낸다. 밖으로 내보내면 제너레이터만 죽고 finished가 비어,
      // 다음 호출에서 실패한 프로그램이 'done'으로 보인다.
      let error: LangError
      if (e instanceof LangError) {
        error = e
      } else if (isStackOverflow(e)) {
        // 식이나 값이 지나치게 깊게 겹쳐 JS 호출 깊이가 넘친 경우이다.
        error = this.fail(TOO_COMPLEX, this.current)
      } else {
        // 실행기나 외부 함수의 버그이다. 원인을 찾을 수 있도록 던져진 값을 cause에 남긴다.
        error = this.fail(UNEXPECTED, this.current)
        error.cause = e
      }
      this.current = error.line
      this.finished = { status: 'error', line: error.line, error }
      return this.finished
    }
    if (r.done) {
      this.finished = { status: 'done', line: this.current }
      return this.finished
    }
    this.lastWasStmt = r.value.stmt
    this.credit -= r.value.ticks
    return null
  }

  private fail(message: string, line: number): LangError {
    return new LangError(message, line, 'runtime')
  }

  // 외부 함수나 값 도우미가 던진 것에 줄 번호를 붙인다.
  // HostError는 플레이어에게 보여 줄 문장이므로 그대로 쓰고, 그 밖의 것은 외부 함수의 버그이므로
  // 영어로 된 내부 문장을 보여 주지 않고 원래 값을 cause에 남긴다. 호출 깊이 초과는 advance가 처리한다.
  private located(e: unknown, line: number): unknown {
    if (e instanceof HostError) return this.fail(e.message, line)
    if (e instanceof LangError || isStackOverflow(e)) return e
    const error = this.fail(UNEXPECTED, line)
    error.cause = e
    return error
  }

  // values의 도우미는 값이 지나치게 크면 Error를 던지므로 줄 번호를 붙여 부른다.
  private guarded<T>(line: number, fn: () => T): T {
    try {
      return fn()
    } catch (e) {
      throw this.located(e, line)
    }
  }

  private same(a: Value, b: Value, line: number): boolean {
    return this.guarded(line, () => equals(a, b))
  }

  private stray(c: Exclude<Completion, null>): LangError {
    return this.fail(
      c.t === 'return' ? 'return은 함수 안에서만 사용할 수 있습니다.' : 'break와 continue는 반복 안에서만 사용할 수 있습니다.',
      c.line,
    )
  }

  // ---- 문장 ----

  private *runTop(ast: Stmt[]): Gen<void> {
    const c = yield* this.execBlock(ast)
    if (c) throw this.stray(c)
  }

  private *execBlock(stmts: Stmt[]): Gen<Completion> {
    for (const s of stmts) {
      this.begin(s.line)
      yield STMT_TICK
      const c = yield* this.execStmt(s)
      if (c) return c
    }
    return null
  }

  private *execStmt(s: Stmt): Gen<Completion> {
    switch (s.t) {
      case 'Expr': {
        const v = yield* this.evalExpr(s.e)
        // 'harvest'처럼 함수 이름만 적은 줄은 아무 일도 하지 않으므로, 조용히 넘어가지 않고 알려 준다.
        const fn = this.namedFunction(s.e, v)
        if (fn) throw this.fail(`함수를 실행하려면 이름 뒤에 괄호를 붙여야 합니다. ${this.callHint(fn)}`, s.line)
        return null
      }
      case 'Assign': {
        const value = yield* this.evalExpr(s.value)
        yield* this.assign(s.target, value, s.line)
        return null
      }
      case 'Aug':
        yield* this.augAssign(s.target, s.op, s.value, s.line)
        return null
      case 'If':
        for (const b of s.branches) {
          if (this.test(b.cond, yield* this.evalExpr(b.cond), b.cond.line)) return yield* this.execBlock(b.body)
        }
        return yield* this.execBlock(s.orelse)
      case 'While':
        for (;;) {
          // 본문이 pass뿐이어도 틱이 소모되도록 조건을 계산할 때마다 틱을 낸다.
          this.begin(s.line)
          yield LOOP_TICK
          if (!this.test(s.cond, yield* this.evalExpr(s.cond), s.line)) return null
          const c = yield* this.execBlock(s.body)
          if (c && c.t === 'break') return null
          if (c && c.t === 'return') return c
        }
      case 'For': {
        const iter = yield* this.evalExpr(s.iter)
        let items: Value[]
        // 순회하는 동안 내용이 바뀌어도 영향을 받지 않도록 사본을 순회한다.
        if (isSeq(iter)) items = [...iter.items]
        else if (isDict(iter)) items = [...iter.map.values()].map(e => e.key)
        else throw this.fail('for로 반복할 수 없는 값입니다.', s.line)
        for (const item of items) {
          this.begin(s.line)
          yield LOOP_TICK
          this.setName(s.name, item)
          const c = yield* this.execBlock(s.body)
          if (c && c.t === 'break') return null
          if (c && c.t === 'return') return c
        }
        return null
      }
      case 'Def':
        this.setName(s.name, { k: 'func', name: s.name, params: s.params, body: s.body })
        return null
      case 'Return':
        return { t: 'return', value: s.value ? yield* this.evalExpr(s.value) : null, line: s.line }
      case 'Break':
        return { t: 'break', line: s.line }
      case 'Continue':
        return { t: 'continue', line: s.line }
      case 'Pass':
        return null
      case 'Global': {
        const frame = this.frames[this.frames.length - 1]
        if (frame) for (const name of s.names) frame.globalNames.add(name)
        return null
      }
    }
  }

  private *assign(target: Expr, value: Value, line: number): Gen<void> {
    if (target.t === 'Name') {
      this.setName(target.id, value)
    } else if (target.t === 'Index') {
      const obj = yield* this.evalExpr(target.obj)
      const idx = yield* this.evalExpr(target.idx)
      this.setIndex(obj, idx, value, line)
    } else {
      throw this.fail('이 자리에는 값을 대입할 수 없습니다.', line)
    }
  }

  private *augAssign(target: Expr, op: BinOp, valueExpr: Expr, line: number): Gen<void> {
    if (target.t === 'Name') {
      // 함수 안에서 이름에 값을 넣으면 지역 변수가 되므로, 바깥에만 있는 변수는 읽어 올 수 없다(파이썬의 UnboundLocalError).
      const frame = this.frames[this.frames.length - 1]
      if (frame && !frame.globalNames.has(target.id) && !frame.locals.has(target.id) && this.globals.has(target.id)) {
        throw this.fail(
          `'${target.id}'라는 변수는 함수 바깥에서 만든 것입니다. 함수 안에서 그 값을 바꾸려면 먼저 global ${target.id}라고 적어야 합니다.`,
          line,
        )
      }
      const old = this.lookup(target.id, target.line)
      const value = yield* this.evalExpr(valueExpr)
      this.setName(target.id, this.arith(op, old, value, line))
    } else if (target.t === 'Index') {
      // 대상의 리스트와 번호는 한 번만 계산한다.
      const obj = yield* this.evalExpr(target.obj)
      const idx = yield* this.evalExpr(target.idx)
      const old = this.getIndex(obj, idx, line)
      const value = yield* this.evalExpr(valueExpr)
      this.setIndex(obj, idx, this.arith(op, old, value, line), line)
    } else {
      throw this.fail('이 자리에는 값을 대입할 수 없습니다.', line)
    }
  }

  // ---- 이름 ----

  private lookup(id: string, line: number): Value {
    const frame = this.frames[this.frames.length - 1]
    let v = frame ? frame.locals.get(id) : undefined
    if (v === undefined) v = this.globals.get(id)
    if (v === undefined) {
      const similar = this.otherCase(id, () => true)
      throw this.fail(
        similar === null
          ? `'${id}'라는 이름을 찾을 수 없습니다. 철자를 확인하거나 먼저 값을 넣어 주세요.`
          : `'${id}'라는 이름을 찾을 수 없습니다. ${this.caseHint(similar)}`,
        line,
      )
    }
    return v
  }

  private caseHint(name: string): string {
    return `대문자와 소문자는 서로 다른 글자로 구분합니다. 이렇게 고쳐 보세요: ${name}`
  }

  // 대소문자만 다른 이름이 정확히 하나 있으면 그 이름을, 없거나 여럿이면 null을 돌려준다.
  // accept는 값이 있는 이름에만 적용하고, 값이 없는 이름(키워드, 잠긴 함수)은 accept가 아무 값이나 받을 때에만 후보로 삼는다.
  private otherCase(id: string, accept: (v: Value) => boolean, valuesOnly = false): string | null {
    const lower = id.toLowerCase()
    const found = new Set<string>()
    const consider = (name: string): void => {
      if (name !== id && name.toLowerCase() === lower) found.add(name)
    }
    const frame = this.frames[this.frames.length - 1]
    if (frame) for (const [name, v] of frame.locals) if (accept(v)) consider(name)
    for (const [name, v] of this.globals) if (accept(v)) consider(name)
    if (!valuesOnly) {
      for (const name of this.knownNames) consider(name)
      for (const name of KEYWORDS) consider(name)
    }
    return found.size === 1 ? [...found][0] : null
  }

  // ---- 함수 이름만 적고 괄호를 빠뜨린 경우 ----

  private callHint(fn: PyFunc | HostFunc): string {
    return `이렇게 고쳐 보세요: ${fn.name}()`
  }

  private missingCall(fn: PyFunc | HostFunc, line: number): LangError {
    return this.fail(`함수 이름만 적으면 함수가 실행되지 않습니다. 값을 얻으려면 괄호를 붙여야 합니다. ${this.callHint(fn)}`, line)
  }

  // 괄호를 빠뜨린 것으로 볼 수 있는 경우에만 그 함수를 돌려준다: 식이 이름 하나이고, 그 이름이 가리키는 값이
  // 바로 그 이름으로 만든 함수일 때이다(can_harvest, 직접 def로 만든 이름). 매개변수나 다른 변수에 담긴 함수는
  // 파이썬과 같이 평범한 값으로 다룬다.
  private namedFunction(e: Expr, v: Value): PyFunc | HostFunc | null {
    return e.t === 'Name' && isFunction(v) && v.name === e.id ? v : null
  }

  // if와 while의 조건, not의 대상을 판정한다. 함수 값은 언제나 참이어서 함수 이름만 적으면 뜻대로 동작하지 않는다.
  private test(e: Expr, v: Value, line: number): boolean {
    const fn = this.namedFunction(e, v)
    if (fn) throw this.missingCall(fn, line)
    return truthy(v)
  }

  private setName(id: string, value: Value): void {
    const frame = this.frames[this.frames.length - 1]
    if (frame && !frame.globalNames.has(id)) frame.locals.set(id, value)
    else this.globals.set(id, value)
  }

  // ---- 식 ----

  private *evalExpr(e: Expr): Gen<Value> {
    switch (e.t) {
      case 'Num':
      case 'Str':
      case 'Const':
        return e.v
      case 'Name':
        return this.lookup(e.id, e.line)
    }
    if (++this.exprDepth > MAX_EXPR_DEPTH) throw this.fail(TOO_COMPLEX, e.line)
    const v = yield* this.evalCompound(e)
    this.exprDepth--
    return v
  }

  private *evalCompound(e: Exclude<Expr, { t: 'Num' | 'Str' | 'Const' | 'Name' }>): Gen<Value> {
    switch (e.t) {
      case 'List':
        return { k: 'list', items: yield* this.evalAll(e.items) }
      case 'Tuple':
        return { k: 'tuple', items: yield* this.evalAll(e.items) }
      case 'Dict': {
        const dict: PyDict = { k: 'dict', map: new Map() }
        for (const [keyExpr, valueExpr] of e.entries) {
          const key = yield* this.evalExpr(keyExpr)
          const value = yield* this.evalExpr(valueExpr)
          dict.map.set(this.key(key, e.line), { key, value })
        }
        return dict
      }
      case 'Unary': {
        const v = yield* this.evalExpr(e.e)
        if (e.op === 'not') return !this.test(e.e, v, e.line)
        if (typeof v !== 'number') throw this.fail(`'-' 연산은 숫자에만 할 수 있습니다. (${typeName(v)})`, e.line)
        return -v
      }
      case 'Bin': {
        const l = yield* this.evalExpr(e.l)
        const r = yield* this.evalExpr(e.r)
        return this.arith(e.op, l, r, e.line)
      }
      case 'Bool': {
        // 필요한 만큼만 계산하고, 마지막으로 계산한 값을 그대로 돌려준다.
        const l = yield* this.evalExpr(e.l)
        if (truthy(l) === (e.op === 'or')) return l
        return yield* this.evalExpr(e.r)
      }
      case 'Cmp': {
        // 연속 비교는 왼쪽부터 계산하다가 거짓이 나오면 멈춘다.
        let left = e.first
        let l = yield* this.evalExpr(left)
        for (const { op, e: right } of e.rest) {
          const r = yield* this.evalExpr(right)
          if (op === '==' || op === '!=') this.checkEquality(left, l, right, r, e.line)
          if (!this.compare(op, l, r, e.line)) return false
          left = right
          l = r
        }
        return true
      }
      case 'Call': {
        if (e.fn.t === 'Attr') {
          const obj = yield* this.evalExpr(e.fn.obj)
          const args = yield* this.evalAll(e.args)
          return this.callMethod(obj, e.fn.name, args, e.line)
        }
        const fn = yield* this.evalExpr(e.fn)
        const args = yield* this.evalAll(e.args)
        if (!isFunction(fn) && e.fn.t === 'Name') {
          const similar = this.otherCase(e.fn.id, isFunction, true)
          if (similar !== null) {
            throw this.fail(`호출하려는 값이 함수가 아닙니다. (${typeName(fn)}) ${this.caseHint(similar)}`, e.line)
          }
        }
        return yield* this.call(fn, args, e.line)
      }
      case 'Index': {
        const obj = yield* this.evalExpr(e.obj)
        const idx = yield* this.evalExpr(e.idx)
        return this.getIndex(obj, idx, e.line)
      }
      case 'Attr':
        throw this.fail('점(.) 뒤의 기능은 괄호를 붙여 호출해야 합니다. 예: 리스트.append(1)', e.line)
    }
  }

  private *evalAll(exprs: Expr[]): Gen<Value[]> {
    const out: Value[] = []
    for (const e of exprs) out.push(yield* this.evalExpr(e))
    return out
  }

  // ---- 호출 ----

  private arityError(name: string, need: string, got: number, line: number): LangError {
    return this.fail(`${name}()에 넣은 인자의 개수가 맞지 않습니다. (필요: ${need}, 넣은 개수: ${got})`, line)
  }

  private checkArity(name: string, min: number, max: number, got: number, line: number): void {
    if (got >= min && got <= max) return
    const need = min === max ? `${min}` : max === Infinity ? `${min} 이상` : `${min}~${max}`
    throw this.arityError(name, need, got, line)
  }

  private *call(fn: Value, args: Value[], line: number): Gen<Value> {
    if (!isFunction(fn)) throw this.fail(`호출하려는 값이 함수가 아닙니다. (${typeName(fn)})`, line)
    if (fn.k === 'host') {
      this.checkArity(fn.name, fn.minArgs, fn.maxArgs, args.length, line)
      let result: Value
      try {
        result = fn.call(args)
      } catch (e) {
        throw this.located(e, line)
      }
      // 동작의 효과가 곧바로 나타나고, 그 뒤에 동작 시간만큼 기다리도록 호출한 다음에 틱을 낸다.
      yield { ticks: fn.ticks, stmt: false }
      return result
    }
    this.checkArity(fn.name, fn.params.length, fn.params.length, args.length, line)
    if (this.frames.length >= MAX_DEPTH) {
      throw this.fail('함수 호출이 너무 깊어졌습니다. 함수가 자기 자신을 끝없이 호출하고 있는지 확인해 주세요.', line)
    }
    const locals = new Map<string, Value>()
    fn.params.forEach((p, i) => locals.set(p, args[i]))
    // 오류가 나면 프로그램이 끝나므로, 아래의 상태는 정상적으로 돌아올 때에만 되돌리면 된다.
    const savedLine = this.current
    const savedDepth = this.exprDepth
    this.exprDepth = 0
    this.frames.push({ locals, globalNames: new Set() })
    const c = yield* this.execBlock(fn.body)
    this.frames.pop()
    this.exprDepth = savedDepth
    this.current = savedLine
    if (!c) return null
    if (c.t === 'return') return c.value
    // 함수 본문의 반복 밖에서 쓴 break가 호출한 쪽의 반복을 끝내서는 안 된다.
    throw this.stray(c)
  }

  private callMethod(obj: Value, name: string, args: Value[], line: number): Value {
    const arity = LIST_METHODS.get(name)
    if (!arity) throw this.fail(`사용할 수 없는 기능입니다: .${name}()`, line)
    if (obj === null || typeof obj !== 'object' || obj.k !== 'list') {
      throw this.fail(`리스트에만 사용할 수 있는 기능입니다: .${name}() (${typeName(obj)})`, line)
    }
    this.checkArity(name, arity[0], arity[1], args.length, line)
    const items = obj.items
    switch (name) {
      case 'append':
        items.push(args[0])
        return null
      case 'pop': {
        if (items.length === 0) throw this.fail('비어 있는 리스트에서는 꺼낼 수 없습니다.', line)
        const i = args.length === 0 ? items.length - 1 : this.position(obj, args[0], line)
        return items.splice(i, 1)[0]
      }
      case 'insert': {
        const n = this.integer(obj, args[0], line)
        // 범위를 벗어난 번호는 파이썬처럼 맨 앞이나 맨 뒤로 맞춘다.
        const i = n < 0 ? Math.max(0, n + items.length) : Math.min(n, items.length)
        items.splice(i, 0, args[1])
        return null
      }
      default: {
        const i = items.findIndex(v => this.same(v, args[0], line))
        if (i < 0) throw this.fail('리스트에 그 값이 없습니다.', line)
        items.splice(i, 1)
        return null
      }
    }
  }

  // ---- 인덱스 ----

  private integer(seq: PyList | PyTuple, idx: Value, line: number): number {
    if (typeof idx !== 'number' || !Number.isInteger(idx)) {
      throw this.fail(`${typeName(seq)}의 번호에는 정수를 넣어야 합니다. (${typeName(idx)})`, line)
    }
    return idx
  }

  // 음수는 뒤에서부터 세어 실제 위치로 바꾼다.
  private position(seq: PyList | PyTuple, idx: Value, line: number): number {
    const n = this.integer(seq, idx, line)
    const length = seq.items.length
    const i = n < 0 ? n + length : n
    if (i < 0 || i >= length) {
      throw this.fail(`${typeName(seq)}의 범위를 벗어났습니다. (길이 ${length}, 번호 ${n})`, line)
    }
    return i
  }

  private key(v: Value, line: number): string {
    return this.guarded(line, () => keyOf(v))
  }

  private getIndex(obj: Value, idx: Value, line: number): Value {
    if (isSeq(obj)) return obj.items[this.position(obj, idx, line)]
    if (isDict(obj)) {
      const entry = obj.map.get(this.key(idx, line))
      if (!entry) throw this.fail(`딕셔너리에 없는 키입니다: ${this.guarded(line, () => repr(idx))}`, line)
      return entry.value
    }
    throw this.fail(`번호로 값을 꺼낼 수 없는 값입니다. (${typeName(obj)})`, line)
  }

  private setIndex(obj: Value, idx: Value, value: Value, line: number): void {
    if (isSeq(obj)) {
      if (obj.k === 'tuple') throw this.fail('튜플의 값은 바꿀 수 없습니다.', line)
      obj.items[this.position(obj, idx, line)] = value
    } else if (isDict(obj)) {
      obj.map.set(this.key(idx, line), { key: idx, value })
    } else {
      throw this.fail(`번호로 값을 넣을 수 없는 값입니다. (${typeName(obj)})`, line)
    }
  }

  // ---- 연산 ----

  private arith(op: BinOp, l: Value, r: Value, line: number): Value {
    if (typeof l === 'number' && typeof r === 'number') {
      switch (op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '**': return l ** r
      }
      if (r === 0) throw this.fail('0으로 나눌 수 없습니다.', line)
      switch (op) {
        case '/': return l / r
        case '//': return Math.floor(l / r)
        case '%': return ((l % r) + r) % r
      }
    }
    if (op === '+') {
      if (typeof l === 'string' && typeof r === 'string') {
        if (l.length + r.length > MAX_SIZE) throw this.fail(`문자열이 너무 길어졌습니다. ${MAX_SIZE}자까지만 만들 수 있습니다.`, line)
        return l + r
      }
      if (isSeq(l) && isSeq(r) && l.k === 'list' && r.k === 'list') {
        if (l.items.length + r.items.length > MAX_SIZE) throw this.fail(`리스트가 너무 길어졌습니다. 한 번에 ${MAX_SIZE}개까지만 담을 수 있습니다.`, line)
        return { k: 'list', items: [...l.items, ...r.items] }
      }
    }
    if (isFunction(l)) throw this.missingCall(l, line)
    if (isFunction(r)) throw this.missingCall(r, line)
    throw this.fail(`'${op}' 연산은 숫자끼리만 할 수 있습니다. (${typeName(l)}, ${typeName(r)})`, line)
  }

  private compare(op: CmpOp, l: Value, r: Value, line: number): boolean {
    switch (op) {
      case '==':
      case '!=':
        return this.same(l, r, line) === (op === '==')
      case 'in': return this.contains(r, l, line)
      case 'not in': return !this.contains(r, l, line)
    }
    if (typeof l !== 'number' || typeof r !== 'number') {
      if (isFunction(l)) throw this.missingCall(l, line)
      if (isFunction(r)) throw this.missingCall(r, line)
      throw this.fail(`크기 비교는 숫자끼리만 할 수 있습니다. (${typeName(l)}, ${typeName(r)})`, line)
    }
    switch (op) {
      case '<': return l < r
      case '<=': return l <= r
      case '>': return l > r
      case '>=': return l >= r
    }
  }

  // 언제나 거짓이 되는 비교 가운데 입문자가 흔히 쓰는 두 가지를 오류로 알려 준다.
  private checkEquality(left: Expr, l: Value, right: Expr, r: Value, line: number): void {
    // can_harvest == True: 함수 이름만 적어 함수 자체를 값과 비교했다.
    // 함수끼리의 비교와 None과의 비교(값이 들어 있는지 확인하는 흔한 방법)는 올바른 코드이므로 그대로 둔다.
    const fl = this.namedFunction(left, l)
    const fr = this.namedFunction(right, r)
    if (fl && !isFunction(r) && r !== null) throw this.missingCall(fl, line)
    if (fr && !isFunction(l) && l !== null) throw this.missingCall(fr, line)
    // get_plant_type() == "Daisy": 상수를 같은 철자의 문자열과 비교했다.
    for (const [a, b] of [[l, r], [r, l]]) {
      if (a !== null && typeof a === 'object' && a.k === 'const' && typeof b === 'string' && b.toLowerCase() === a.name.toLowerCase()) {
        throw this.fail(`따옴표를 붙인 값은 글자로 취급되어 상수와 같지 않습니다. 따옴표 없이 이렇게 써 주세요: ${a.name}`, line)
      }
    }
  }

  private contains(container: Value, item: Value, line: number): boolean {
    if (isSeq(container)) return container.items.some(v => this.same(v, item, line))
    if (isDict(container)) return container.map.has(this.key(item, line))
    throw this.fail(`'in'은 리스트, 튜플, 딕셔너리에만 사용할 수 있습니다. (${typeName(container)})`, line)
  }
}
