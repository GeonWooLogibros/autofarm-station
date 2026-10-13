import type { BinOp, CmpOp, Expr, Stmt } from './ast'
import { LangError } from './errors'
import { tokenize, UNSUPPORTED } from './lexer'
import type { Token } from './lexer'

// 겹침이 너무 깊으면 JS 호출 깊이가 넘쳐 LangError가 아닌 오류가 나므로 미리 막는다.
const MAX_DEPTH = 100
const AUG_OPS: Record<string, BinOp> = {
  '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '**=': '**', '//=': '//',
}
const CMP_OPS = new Set(['==', '!=', '<', '<=', '>', '>='])
const ASSIGN_TARGET_ERROR = '이 자리에는 값을 대입할 수 없습니다. 변수 이름이나 리스트[번호] 형태만 대입할 수 있습니다.'
// 줄의 맨 앞에 오는 키워드와 식 가운데에 오는 키워드. 대문자를 섞어 쓴 경우를 찾아 알려 주는 데 쓴다.
const LINE_KEYWORDS = new Set(['while', 'if', 'elif', 'else', 'for', 'def', 'return', 'global'])
const INFIX_KEYWORDS = new Set(['and', 'or', 'not', 'in', 'is'])
const CONDITION_EXAMPLE: Record<string, string> = { while: 'while True:', if: 'if can_harvest():', elif: 'elif can_harvest():' }

class Parser {
  private pos = 0
  private depth = 0

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    const t = this.tokens[this.pos + offset]
    if (t) return t
    // 토큰이 모자라도 읽기 오류가 나지 않도록 마지막 줄의 eof를 대신 돌려준다.
    const last = this.tokens[this.tokens.length - 1]
    return { type: 'eof', value: '', line: last ? last.line : 1 }
  }

  private next(): Token {
    const t = this.peek()
    if (this.pos < this.tokens.length) this.pos++
    return t
  }

  private isOp(v: string, offset = 0): boolean {
    const t = this.peek(offset)
    return t.type === 'op' && t.value === v
  }

  private isKw(v: string, offset = 0): boolean {
    const t = this.peek(offset)
    return t.type === 'kw' && t.value === v
  }

  private atLineEnd(): boolean {
    const t = this.peek()
    return t.type === 'newline' || t.type === 'eof'
  }

  private expectOp(v: string, hint: string): Token {
    if (!this.isOp(v)) throw new LangError(hint, this.hintLine(), 'syntax')
    return this.next()
  }

  // 줄이 끝난 자리에서 무언가 빠진 경우 그 줄 번호를, 아니면 현재 토큰의 줄을 쓴다.
  private hintLine(): number {
    return this.peek().line
  }

  private unexpected(tok: Token): LangError {
    if (tok.type === 'kw' && UNSUPPORTED.has(tok.value)) {
      return new LangError(`'${tok.value}'는 이 게임에서 지원하지 않는 문법입니다.`, tok.line, 'syntax')
    }
    if (tok.type === 'newline' || tok.type === 'eof') {
      return new LangError('이 줄을 이해할 수 없습니다: 줄이 끝났는데 식이 더 필요합니다. 빠진 내용이 없는지 확인해 주세요.', tok.line, 'syntax')
    }
    if (tok.type === 'indent' || tok.type === 'dedent') {
      return new LangError('들여쓰기가 맞지 않습니다. 이 줄은 앞 줄보다 안쪽으로 들여 쓸 수 없습니다.', tok.line, 'syntax')
    }
    return new LangError(`이 줄을 이해할 수 없습니다: '${tok.value}' 근처를 확인해 주세요.`, tok.line, 'syntax')
  }

  // 같은 단계의 연산자가 한없이 이어지면 왼쪽으로 깊은 트리가 되어 실행 때 호출 깊이가 넘친다.
  private chain(n: number, line: number): number {
    if (n >= MAX_DEPTH) {
      throw new LangError('연산자가 너무 길게 이어져 있습니다. 식을 나누어 여러 줄로 써 주세요.', line, 'syntax')
    }
    return n + 1
  }

  private nest<T>(line: number, fn: () => T): T {
    if (this.depth >= MAX_DEPTH) {
      throw new LangError('코드가 너무 깊게 겹쳐 있습니다. 괄호나 들여쓰기를 줄여 주세요.', line, 'syntax')
    }
    this.depth++
    try { return fn() } finally { this.depth-- }
  }

  program(): Stmt[] {
    const body: Stmt[] = []
    while (this.peek().type !== 'eof') body.push(this.stmt())
    return body
  }

  // ---- 문장 ----

  private stmt(): Stmt {
    const tok = this.peek()
    if (tok.type === 'kw') {
      switch (tok.value) {
        case 'if': return this.ifStmt()
        case 'while': return this.whileStmt()
        case 'for': return this.forStmt()
        case 'def': return this.defStmt()
        case 'elif':
        case 'else':
          throw new LangError(`'${tok.value}'는 앞에 짝이 되는 'if'가 있어야 합니다.`, tok.line, 'syntax')
      }
    }
    if (tok.type === 'name') this.checkKeywordCase(tok)
    const s = this.simple()
    if (s.t === 'Expr') this.checkBareExpr(s.e, s.line)
    this.endOfLine()
    return s
  }

  // 'While True:'처럼 키워드에 대문자를 섞어 쓴 줄. 같은 철자의 변수에 값을 넣거나 함수로 부르는 줄은 그대로 둔다.
  private checkKeywordCase(tok: Token): void {
    const lower = tok.value.toLowerCase()
    if (lower === tok.value || !LINE_KEYWORDS.has(lower)) return
    const next = this.peek(1)
    if (next.type === 'newline' || next.type === 'eof') return
    if (next.type === 'op' && next.value !== ':') return
    throw this.keywordCase(lower, tok.line)
  }

  private keywordCase(keyword: string, line: number): LangError {
    return new LangError(`키워드는 소문자로 써야 합니다. 이렇게 고쳐 보세요: ${keyword}`, line, 'syntax')
  }

  // 값을 만들기만 하고 쓰지 않는 줄은 입문자가 의도한 것이 아니므로, 무엇을 쓰려던 것인지 짐작하여 알려 준다.
  private checkBareExpr(e: Expr, line: number): void {
    const next = this.peek()
    if (e.t === 'Name' && (next.type === 'name' || next.type === 'num' || (next.type === 'kw' && /^[A-Z]/.test(next.value)))) {
      throw new LangError(`함수에 값을 넣을 때에는 괄호가 필요합니다. 이렇게 고쳐 보세요: ${e.id}(${next.value})`, line, 'syntax')
    }
    if (next.type !== 'newline' && next.type !== 'eof') return
    if (e.t === 'Bin') {
      const hint = e.l.t === 'Name' && e.r.t === 'Num' ? ` 예: ${e.l.id} ${e.op}= ${e.r.v}` : ''
      throw new LangError(`계산한 값을 어디에도 쓰지 않는 줄입니다. 값을 변수에 저장하려면 =나 +=를 써야 합니다.${hint}`, line, 'syntax')
    }
    if (e.t === 'Cmp' && e.rest.length === 1 && e.rest[0].op === '==') {
      const r = e.rest[0].e
      const hint = e.first.t === 'Name' && r.t === 'Num' ? ` 예: ${e.first.id} = ${r.v}` : ''
      throw new LangError(`==는 두 값이 같은지 비교하는 기호입니다. 변수에 값을 저장하려면 =를 하나만 써야 합니다.${hint}`, line, 'syntax')
    }
  }

  private endOfLine(): void {
    const tok = this.peek()
    if (tok.type === 'newline') { this.next(); return }
    if (tok.type === 'eof') return
    if (tok.type === 'op' && tok.value === ',' && this.assignsLaterOnLine()) {
      throw new LangError('여러 변수에 한꺼번에 대입하는 것은 이 게임에서 지원하지 않는 문법입니다.', tok.line, 'syntax')
    }
    throw this.unexpected(tok)
  }

  private assignsLaterOnLine(): boolean {
    for (let i = 0; ; i++) {
      const t = this.peek(i)
      if (t.type === 'newline' || t.type === 'eof') return false
      if (t.type === 'op' && t.value === '=') return true
    }
  }

  private simple(): Stmt {
    const tok = this.peek()
    const line = tok.line
    if (tok.type === 'kw') {
      switch (tok.value) {
        case 'pass': this.next(); return { t: 'Pass', line }
        case 'break': this.next(); return { t: 'Break', line }
        case 'continue': this.next(); return { t: 'Continue', line }
        case 'return': {
          this.next()
          return { t: 'Return', value: this.atLineEnd() ? null : this.expr(), line }
        }
        case 'global': {
          this.next()
          const names = [this.nameToken("'global' 뒤에는 변수 이름이 필요합니다.")]
          while (this.isOp(',')) {
            this.next()
            names.push(this.nameToken("'global' 뒤에는 변수 이름이 필요합니다."))
          }
          return { t: 'Global', names, line }
        }
      }
    }
    const e = this.expr()
    const op = this.peek()
    if (op.type === 'op' && op.value === '=') {
      this.checkTarget(e, line)
      this.next()
      if (this.isOp('+') && e.t === 'Name') {
        const n = this.peek(1)
        const value = n.type === 'num' || n.type === 'name' ? n.value : '1'
        throw new LangError(`값을 더해서 다시 저장할 때에는 =+가 아니라 +=를 씁니다. 이렇게 고쳐 보세요: ${e.id} += ${value}`, line, 'syntax')
      }
      return { t: 'Assign', target: e, value: this.expr(), line }
    }
    if (op.type === 'op' && op.value in AUG_OPS) {
      this.checkTarget(e, line)
      this.next()
      return { t: 'Aug', target: e, op: AUG_OPS[op.value], value: this.expr(), line }
    }
    return { t: 'Expr', e, line }
  }

  private checkTarget(e: Expr, line: number): void {
    if (e.t !== 'Name' && e.t !== 'Index') throw new LangError(ASSIGN_TARGET_ERROR, line, 'syntax')
  }

  private nameToken(hint: string): string {
    const tok = this.peek()
    if (tok.type !== 'name') throw new LangError(hint, tok.line, 'syntax')
    this.next()
    return tok.value
  }

  private block(kw: string, headLine: number): Stmt[] {
    if (!this.isOp(':')) throw this.missingColon(kw, headLine)
    this.next()
    const indentError = () => new LangError(`'${kw}' 다음 줄은 안쪽으로 들여 써야 합니다.`, headLine, 'syntax')
    if (this.peek().type !== 'newline') throw indentError()
    this.next()
    if (this.peek().type !== 'indent') throw indentError()
    this.next()
    return this.nest(headLine, () => {
      const body: Stmt[] = []
      while (this.peek().type !== 'dedent' && this.peek().type !== 'eof') body.push(this.stmt())
      if (this.peek().type === 'dedent') this.next()
      return body
    })
  }

  // 콜론이 와야 할 자리에 다른 것이 있을 때, 흔한 실수이면 그 원인을 알려 준다.
  private missingColon(kw: string, headLine: number): LangError {
    const tok = this.peek()
    const condition = kw === 'if' || kw === 'elif' || kw === 'while'
    if (condition && tok.type === 'op' && tok.value === '=') {
      const after = this.peek(1)
      if (after.type === 'op' && (after.value === '<' || after.value === '>')) {
        return new LangError(`크거나 같은지는 >=로, 작거나 같은지는 <=로 씁니다. 이렇게 고쳐 보세요: ${after.value}=`, headLine, 'syntax')
      }
      return new LangError('두 값이 같은지 비교할 때에는 =가 아니라 ==를 써야 합니다.', headLine, 'syntax')
    }
    if (condition && tok.type === 'op' && tok.value === ',') {
      return new LangError('조건에는 쉼표(,)를 쓸 수 없습니다. 소수는 0.5처럼 점으로 씁니다.', headLine, 'syntax')
    }
    if (tok.type === 'name' && tok.value !== tok.value.toLowerCase() && INFIX_KEYWORDS.has(tok.value.toLowerCase())) {
      return this.keywordCase(tok.value.toLowerCase(), headLine)
    }
    return new LangError(`'${kw}' 줄의 끝에 콜론(:)이 필요합니다.`, headLine, 'syntax')
  }

  // 'while:'처럼 조건 없이 콜론이 바로 나온 경우
  private condition(kw: string, line: number): Expr {
    if (this.isOp(':')) {
      throw new LangError(`'${kw}' 뒤에는 조건이 필요합니다. 예: ${CONDITION_EXAMPLE[kw]}`, line, 'syntax')
    }
    return this.expr()
  }

  private ifStmt(): Stmt {
    const line = this.next().line
    const branches: { cond: Expr; body: Stmt[] }[] = []
    const cond = this.condition('if', line)
    branches.push({ cond, body: this.block('if', line) })
    let orelse: Stmt[] = []
    while (this.isKw('elif')) {
      const l = this.next().line
      const c = this.condition('elif', l)
      branches.push({ cond: c, body: this.block('elif', l) })
    }
    if (this.isKw('else')) {
      const l = this.next().line
      orelse = this.block('else', l)
    }
    return { t: 'If', branches, orelse, line }
  }

  private whileStmt(): Stmt {
    const line = this.next().line
    const cond = this.condition('while', line)
    return { t: 'While', cond, body: this.block('while', line), line }
  }

  private forStmt(): Stmt {
    const line = this.next().line
    const name = this.nameToken("'for' 뒤에는 변수 이름 하나가 필요합니다. 예: for i in range(3):")
    if (!this.isKw('in')) {
      throw new LangError("'for' 줄은 'for 변수 in 목록:' 형태로 써야 합니다.", this.hintLine(), 'syntax')
    }
    this.next()
    const iter = this.expr()
    return { t: 'For', name, iter, body: this.block('for', line), line }
  }

  private defStmt(): Stmt {
    const line = this.next().line
    const name = this.nameToken("'def' 다음에는 함수 이름이 필요합니다. 예: def 함수이름():")
    const open = this.expectOp('(', "함수 이름 뒤에는 여는 괄호 '('가 필요합니다.")
    const params: string[] = []
    while (!this.isOp(')') && !this.atLineEnd()) {
      params.push(this.nameToken('매개변수 자리에는 변수 이름이 필요합니다.'))
      if (this.isOp(',')) this.next()
      else break
    }
    this.expectClose(')', open.line)
    return { t: 'Def', name, params, body: this.block('def', line), line }
  }

  // ---- 식 ----

  private expectClose(close: string, openLine: number): void {
    if (this.isOp(close)) { this.next(); return }
    const tok = this.peek()
    if (tok.type === 'newline' || tok.type === 'eof') {
      throw new LangError(`괄호가 닫히지 않았습니다. '${close}'가 필요합니다.`, openLine, 'syntax')
    }
    throw this.unexpected(tok)
  }

  private expr(): Expr {
    return this.nest(this.peek().line, () => this.orExpr())
  }

  private orExpr(): Expr {
    let l = this.andExpr()
    let n = 0
    while (this.isKw('or')) {
      n = this.chain(n, l.line)
      this.next()
      l = { t: 'Bool', op: 'or', l, r: this.andExpr(), line: l.line }
    }
    return l
  }

  private andExpr(): Expr {
    let l = this.notExpr()
    let n = 0
    while (this.isKw('and')) {
      n = this.chain(n, l.line)
      this.next()
      l = { t: 'Bool', op: 'and', l, r: this.notExpr(), line: l.line }
    }
    return l
  }

  private notExpr(): Expr {
    if (this.isKw('not')) {
      const line = this.next().line
      return { t: 'Unary', op: 'not', e: this.nest(line, () => this.notExpr()), line }
    }
    return this.cmpExpr()
  }

  private cmpOp(): CmpOp | null {
    const tok = this.peek()
    if (tok.type === 'op' && CMP_OPS.has(tok.value)) { this.next(); return tok.value as CmpOp }
    if (tok.type !== 'kw') return null
    if (tok.value === 'in') { this.next(); return 'in' }
    if (tok.value === 'not' && this.isKw('in', 1)) { this.next(); this.next(); return 'not in' }
    if (tok.value === 'is') {
      this.next()
      if (this.isKw('not')) { this.next(); return '!=' }
      return '=='
    }
    return null
  }

  private cmpExpr(): Expr {
    const first = this.arith()
    const rest: { op: CmpOp; e: Expr }[] = []
    for (let op = this.cmpOp(); op; op = this.cmpOp()) {
      this.chain(rest.length, first.line)
      rest.push({ op, e: this.arith() })
    }
    return rest.length === 0 ? first : { t: 'Cmp', first, rest, line: first.line }
  }

  private arith(): Expr {
    let l = this.term()
    let n = 0
    while (this.isOp('+') || this.isOp('-')) {
      n = this.chain(n, l.line)
      const op = this.next().value as BinOp
      l = { t: 'Bin', op, l, r: this.term(), line: l.line }
    }
    return l
  }

  private term(): Expr {
    let l = this.unary()
    let n = 0
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
      n = this.chain(n, l.line)
      const op = this.next().value as BinOp
      l = { t: 'Bin', op, l, r: this.unary(), line: l.line }
    }
    return l
  }

  private unary(): Expr {
    if (this.isOp('-')) {
      const line = this.next().line
      return { t: 'Unary', op: '-', e: this.nest(line, () => this.unary()), line }
    }
    return this.power()
  }

  private power(): Expr {
    const base = this.postfix()
    if (this.isOp('**')) {
      this.next()
      return { t: 'Bin', op: '**', l: base, r: this.nest(base.line, () => this.unary()), line: base.line }
    }
    return base
  }

  private postfix(): Expr {
    let e = this.atom()
    for (;;) {
      if (this.isOp('(')) {
        const open = this.next()
        const args = this.items(')', open.line, () => this.expr())
        e = { t: 'Call', fn: e, args, line: e.line }
      } else if (this.isOp('[')) {
        const open = this.next()
        const idx = this.expr()
        this.expectClose(']', open.line)
        e = { t: 'Index', obj: e, idx, line: e.line }
      } else if (this.isOp('.')) {
        this.next()
        const name = this.nameToken("'.' 뒤에는 이름이 필요합니다. 예: 리스트.append(1)")
        e = { t: 'Attr', obj: e, name, line: e.line }
      } else {
        return e
      }
    }
  }

  // 쉼표로 구분된 항목들을 읽고 닫는 괄호까지 소비한다. 마지막 쉼표는 허용한다.
  private items<T>(close: string, openLine: number, item: () => T): T[] {
    const out: T[] = []
    while (!this.isOp(close) && !this.atLineEnd()) {
      out.push(item())
      if (this.isOp(',')) this.next()
      else break
    }
    this.expectClose(close, openLine)
    return out
  }

  private atom(): Expr {
    const tok = this.peek()
    const line = tok.line
    switch (tok.type) {
      case 'num': this.next(); return { t: 'Num', v: Number(tok.value), line }
      case 'str': this.next(); return { t: 'Str', v: tok.value, line }
      case 'name': this.next(); return { t: 'Name', id: tok.value, line }
      case 'kw':
        if (tok.value === 'True') { this.next(); return { t: 'Const', v: true, line } }
        if (tok.value === 'False') { this.next(); return { t: 'Const', v: false, line } }
        if (tok.value === 'None') { this.next(); return { t: 'Const', v: null, line } }
        throw this.unexpected(tok)
      case 'op':
        if (tok.value === '(') return this.parenAtom()
        if (tok.value === '[') {
          this.next()
          return { t: 'List', items: this.items(']', line, () => this.expr()), line }
        }
        if (tok.value === '{') {
          this.next()
          const entries = this.items('}', line, (): [Expr, Expr] => {
            const k = this.expr()
            this.expectOp(':', '딕셔너리의 키 뒤에는 콜론(:)이 필요합니다. 예: {"a": 1}')
            return [k, this.expr()]
          })
          return { t: 'Dict', entries, line }
        }
        throw this.unexpected(tok)
      default:
        throw this.unexpected(tok)
    }
  }

  private parenAtom(): Expr {
    const open = this.next()
    const line = open.line
    if (this.isOp(')')) { this.next(); return { t: 'Tuple', items: [], line } }
    const first = this.expr()
    if (!this.isOp(',')) {
      this.expectClose(')', line)
      return first
    }
    const items = [first]
    while (this.isOp(',')) {
      this.next()
      if (this.isOp(')') || this.atLineEnd()) break
      items.push(this.expr())
    }
    this.expectClose(')', line)
    return { t: 'Tuple', items, line }
  }
}

export function parse(tokens: Token[]): Stmt[] { return new Parser(tokens).program() }
export function parseSource(source: string): Stmt[] { return parse(tokenize(source)) }
