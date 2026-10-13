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
