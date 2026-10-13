import type { Expr, Stmt } from './ast'
import { LangError } from './errors'

export type Feature = 'loop' | 'cond' | 'var' | 'func' | 'for' | 'list' | 'dict'
export const ALL_FEATURES: Feature[] = ['loop', 'cond', 'var', 'func', 'for', 'list', 'dict']

const TOO_COMPLEX = '식이 너무 복잡합니다. 여러 줄로 나누어 써 주세요.'

/** 프로그램 어딘가에서 직접 만든 이름(대입 대상, def 이름, for 변수, 매개변수)을 모은다. */
function collectDefined(body: Stmt[], out: Set<string>): void {
  for (const s of body) {
    switch (s.t) {
      case 'Assign':
        if (s.target.t === 'Name') out.add(s.target.id)
        break
      case 'Def':
        out.add(s.name)
        for (const p of s.params) out.add(p)
        collectDefined(s.body, out)
        break
      case 'For':
        out.add(s.name)
        collectDefined(s.body, out)
        break
      case 'While':
        collectDefined(s.body, out)
        break
      case 'If':
        for (const b of s.branches) collectDefined(b.body, out)
        collectDefined(s.orelse, out)
        break
      default:
        break
    }
  }
}

export type LockedText = (kind: 'syntax' | 'name' | 'plant', label: string, title: string) => string

/** 잠긴 문법이나 잠긴 이름이 있으면 LangError('locked')를 던진다. lockedText가 없으면 본편의 문구를 쓴다. */
export function check(
  ast: Stmt[],
  features: Set<Feature>,
  featureTitles: Record<Feature, string>,
  lockedNames: Map<string, string>,
  lockedText?: LockedText,
): void {
  const defined = new Set<string>()
  collectDefined(ast, defined)
  let current = 1

  const need = (f: Feature, label: string, line: number): void => {
    if (features.has(f)) return
    throw new LangError(
      lockedText
        ? lockedText('syntax', label, featureTitles[f])
        : `아직 해금하지 않은 문법입니다: ${label}. 해금 화면에서 '${featureTitles[f]}' 항목을 해금하면 사용할 수 있습니다.`,
      line,
      'locked',
    )
  }

  const expr = (e: Expr): void => {
    switch (e.t) {
      case 'Num':
      case 'Str':
        return
      case 'Const':
        if (e.v === null) need('cond', 'None', e.line)
        return
      case 'Name': {
        const title = lockedNames.get(e.id)
        if (title !== undefined && !defined.has(e.id)) {
          throw new LangError(
            lockedText
              ? lockedText('name', e.id, title)
              : `아직 해금하지 않은 기능입니다: ${e.id}. 해금 화면에서 '${title}' 항목을 해금하면 사용할 수 있습니다.`,
            e.line,
            'locked',
          )
        }
        return
      }
      case 'List':
        need('list', '리스트', e.line)
        e.items.forEach(expr)
        return
      case 'Tuple':
        need('list', '리스트', e.line)
        e.items.forEach(expr)
        return
      case 'Dict':
        need('dict', '딕셔너리', e.line)
        for (const [k, v] of e.entries) {
          expr(k)
          expr(v)
        }
        return
      case 'Unary':
        if (e.op === 'not') need('cond', 'not', e.line)
        else need('var', '계산식', e.line)
        expr(e.e)
        return
      case 'Bin':
        need('var', '계산식', e.line)
        expr(e.l)
        expr(e.r)
        return
      case 'Bool':
        need('cond', 'and/or', e.line)
        expr(e.l)
        expr(e.r)
        return
      case 'Cmp':
        need('cond', '비교 연산', e.line)
        expr(e.first)
        for (const r of e.rest) expr(r.e)
        return
      case 'Call':
        expr(e.fn)
        e.args.forEach(expr)
        return
      case 'Index':
        need('list', '리스트', e.line)
        expr(e.obj)
        expr(e.idx)
        return
      case 'Attr':
        need('list', '리스트', e.line)
        expr(e.obj)
        return
    }
  }

  const block = (body: Stmt[]): void => body.forEach(stmt)

  const stmt = (s: Stmt): void => {
    switch (s.t) {
      case 'Expr':
        expr(s.e)
        return
      case 'Assign':
        need('var', '변수 대입', s.line)
        expr(s.target)
        expr(s.value)
        return
      case 'Aug':
        need('var', '변수 대입', s.line)
        expr(s.target)
        expr(s.value)
        return
      case 'If':
        need('cond', 'if', s.line)
        for (const b of s.branches) {
          expr(b.cond)
          block(b.body)
        }
        block(s.orelse)
        return
      case 'While':
        need('loop', 'while', s.line)
        expr(s.cond)
        block(s.body)
        return
      case 'For':
        need('for', 'for', s.line)
        expr(s.iter)
        block(s.body)
        return
      case 'Def':
        need('func', 'def', s.line)
        block(s.body)
        return
      case 'Return':
        need('func', 'return', s.line)
        if (s.value) expr(s.value)
        return
      case 'Break':
        need('loop', 'break', s.line)
        return
      case 'Continue':
        need('loop', 'continue', s.line)
        return
      case 'Global':
        need('func', 'global', s.line)
        return
      case 'Pass':
        return
    }
  }

  try {
    for (const s of ast) {
      current = s.line
      stmt(s)
    }
  } catch (e) {
    if (e instanceof RangeError) throw new LangError(TOO_COMPLEX, current, 'syntax')
    throw e
  }
}
