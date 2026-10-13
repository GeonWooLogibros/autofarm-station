import { parseSource } from './parser'
import { check, type Feature, type LockedText } from './checker'
import { Program, type StepResult } from './interpreter'
import { HostError, LangError } from './errors'
import type { Value } from './values'

export interface CompileOptions {
  features: Set<Feature>
  featureTitles: Record<Feature, string> // 문법 → 해금 항목 이름
  globals: Map<string, Value>
  lockedNames: Map<string, string> // 잠긴 함수 이름 → 해금 항목 이름
  lockedText?: LockedText // 잠금 문구를 바꾸고 싶을 때(과제용). 없으면 본편의 문구
}
export type CompileResult = { ok: true; program: Program } | { ok: false; error: LangError }

export function compile(source: string, opts: CompileOptions): CompileResult {
  try {
    const ast = parseSource(source)
    check(ast, opts.features, opts.featureTitles, opts.lockedNames, opts.lockedText)
    return { ok: true, program: new Program(ast, new Map(opts.globals), [...opts.lockedNames.keys()]) }
  } catch (e) {
    if (e instanceof LangError) return { ok: false, error: e }
    throw e
  }
}

export { HostError, LangError, Program }
export type { StepResult, Value, Feature, LockedText }
