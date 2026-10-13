import { ChallengeRun, STEP_MS } from './challengeRun'
import type { FailReason, RunStats } from './challengeRun'
import type { ChallengeDef } from './challenges'

export interface SeedResult {
  seed: number
  status: 'success' | 'failed'
  reason: FailReason | null
  score: number | null
  stats: RunStats
  errorText: string | null // 오류로 실패했을 때 출력창에 나온 문장
}

export interface JudgeResult {
  ok: boolean // 모든 시드에서 성공
  score: number | null // 시드별 기록의 합. ok일 때에만 값이 있다
  actions: number // 시드별 동작 횟수의 합
  results: SeedResult[] // def.seeds의 순서
  failedSeed: number | null // 처음 실패한 시드
}

// 끝난 실행을 결과로 바꾼다. 화면에서 본 실행과 화면 없이 한 실행이 함께 쓴다.
export function seedResult(run: ChallengeRun): SeedResult {
  const error = run.reason === 'error' ? run.game.output.filter(o => o.kind === 'error').at(-1) : undefined
  return {
    seed: run.seed,
    status: run.status === 'success' ? 'success' : 'failed',
    reason: run.reason,
    score: run.score,
    stats: run.stats,
    errorText: error ? error.text : null,
  }
}

// 화면 없이 끝까지 실행한다. 제한 시간이 있으므로 끝나지 않는 코드도 반드시 끝난다.
export function runSeed(def: ChallengeDef, seed: number, code: string): SeedResult {
  const run = new ChallengeRun(def, seed, code)
  run.start()
  while (run.status === 'running') run.advance(STEP_MS)
  return seedResult(run)
}

// 배치별 결과를 하나의 심사 결과로 모은다. 기록으로 쓰는 값은 언제나 이 함수에서 나온다.
// 실행하지 않은 배치가 남아 있으면 성공이 아니다. 같은 시드가 여러 번 있으면 먼저 온 것만 쓴다.
export function collectJudge(def: ChallengeDef, results: SeedResult[]): JudgeResult {
  const ordered = def.seeds.flatMap(seed => results.filter(r => r.seed === seed).slice(0, 1))
  const failed = ordered.find(r => r.status !== 'success')
  const ok = failed === undefined && ordered.length === def.seeds.length
  return {
    ok,
    score: ok ? ordered.reduce((sum, r) => sum + (r.score ?? 0), 0) : null,
    actions: ordered.reduce((sum, r) => sum + r.stats.actions, 0),
    results: ordered,
    failedSeed: failed ? failed.seed : null,
  }
}

// 모든 시드를 화면 없이 실행해 심사한다. 다른 곳에서 한 실행의 결과는 받지 않는다.
export function judge(def: ChallengeDef, code: string): JudgeResult {
  return collectJudge(def, def.seeds.map(seed => runSeed(def, seed, code)))
}
