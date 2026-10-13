import { describe, expect, test } from 'vitest'
import { CHALLENGES } from '../../src/progress/challenges'
import { collectJudge, judge, runSeed, seedResult } from '../../src/progress/challengeJudge'
import type { SeedResult } from '../../src/progress/challengeJudge'
import { ChallengeRun, STEP_MS } from '../../src/progress/challengeRun'
import type { FailReason } from '../../src/progress/challengeRun'
import { SOLUTIONS } from '../model/challengeSolutions'

const c1 = CHALLENGES[0]
const c6 = CHALLENGES[5]
const c8 = CHALLENGES[7]

// 첫 시드의 배치에서 꽃잎이 많은 순서대로 8송이의 자리를 좌표로 직접 적은 코드. 다른 배치에서는 전력이 모자란다.
function hardcodedSunflowers(): string {
  const s = c6.setup(c6.seeds[0])
  const order = s.cells.map((c, i) => ({ v: c.value, x: i % s.w, y: Math.floor(i / s.w) })).sort((a, b) => b.v - a.v).slice(0, 8)
  const lines: string[] = []
  let x = 0, y = 0
  for (const t of order) {
    for (; x < t.x; x++) lines.push('move(Right)')
    for (; x > t.x; x--) lines.push('move(Left)')
    for (; y < t.y; y++) lines.push('move(Up)')
    for (; y > t.y; y--) lines.push('move(Down)')
    lines.push('harvest()')
  }
  return lines.join('\n') + '\n'
}

describe('과제 심사', () => {
  test('score는 시드별 기록의 합이고 actions는 동작 횟수의 합이다', () => {
    for (const def of [c1, c6, c8]) {
      const code = SOLUTIONS[def.id].simple
      const each = def.seeds.map(seed => runSeed(def, seed, code))
      const r = judge(def, code)
      expect(r.ok).toBe(true)
      expect(r.failedSeed).toBeNull()
      expect(r.results).toEqual(each)
      expect(r.results.map(x => x.seed)).toEqual(def.seeds)
      expect(r.score).toBe(each.reduce((sum, x) => sum + x.score!, 0))
      expect(r.actions).toBe(each.reduce((sum, x) => sum + x.stats.actions, 0))
    }
  })

  test('한 시드의 답을 직접 적은 코드는 다른 시드에서 실패한다', () => {
    const code = hardcodedSunflowers()
    expect(runSeed(c6, c6.seeds[0], code).status).toBe('success')
    const r = judge(c6, code)
    expect(r.ok).toBe(false)
    expect(r.score).toBeNull()
    expect(r.failedSeed).toBe(c6.seeds[1])
    expect(r.results[1].reason).toBe('ended')
    expect(r.results).toHaveLength(3)
  })

  test('오류로 실패하면 출력창의 문장을 함께 돌려준다', () => {
    const e = runSeed(c1, 1, 'harvest(1)\n')
    expect([e.status, e.reason, e.score]).toEqual(['failed', 'error', null])
    expect(e.errorText).toMatch(/^1번째 줄: /)
    const locked = runSeed(c1, 1, 'move(Right)\n')
    expect(locked.reason).toBe('error')
    expect(locked.errorText).toContain('이 과제에서는 쓸 수 없는')
    expect(runSeed(c1, 1, 'harvest()\n').errorText).toBeNull()
  })

  test('끝나지 않는 코드도 2초 안에 심사가 끝난다', () => {
    for (const def of CHALLENGES) {
      const code = def.no === 1 ? 'while True:\n    print(1)\n' : 'while True:\n    move(Right)\n'
      const began = performance.now()
      const r = judge(def, code)
      expect(performance.now() - began).toBeLessThan(2000)
      expect(r.ok).toBe(false)
      expect(r.failedSeed).toBe(def.seeds[0])
      for (const x of r.results) {
        expect(x.reason).toBe('timeout')
        expect(x.stats.timeMs).toBe(def.limitMs)
      }
    }
  })

  test('runSeed의 결과는 화면에서 조금씩 진행한 실행과 같다', () => {
    for (const def of [c1, c6, c8]) {
      const code = SOLUTIONS[def.id].tuned
      for (const seed of def.seeds) {
        const run = new ChallengeRun(def, seed, code)
        run.start()
        while (run.status === 'running') run.advance(16)
        const r = runSeed(def, seed, code)
        expect(r.status).toBe(run.status)
        expect(r.reason).toBe(run.reason)
        expect(r.score).toBe(run.score)
        expect(r.stats).toEqual(run.stats)
      }
    }
  })
})

describe('seedResult', () => {
  test('끝난 실행을 runSeed와 같은 모양으로 바꾼다', () => {
    const code = SOLUTIONS[c1.id].simple
    const run = new ChallengeRun(c1, c1.seeds[0], code)
    run.start()
    while (run.status === 'running') run.advance(50)
    expect(seedResult(run)).toEqual(runSeed(c1, c1.seeds[0], code))
  })
  test('오류로 끝난 실행은 오류 문장을 담는다', () => {
    const run = new ChallengeRun(c1, c1.seeds[0], 'foo()')
    run.start()
    while (run.status === 'running') run.advance(50)
    const r = seedResult(run)
    expect(r).toMatchObject({ status: 'failed', reason: 'error', score: null })
    expect(r.errorText).toContain('foo')
  })
  test('정지한 실행은 실패이고 오류 문장이 없다', () => {
    const run = new ChallengeRun(c1, c1.seeds[0], 'while True:\n    harvest()')
    run.start()
    run.advance(50)
    run.stop()
    expect(seedResult(run)).toMatchObject({ seed: c1.seeds[0], status: 'failed', reason: 'stopped', errorText: null })
  })
})

describe('한 단계 실행으로 만든 성공', () => {
  const code = 'harvest()\n'.repeat(5)

  // 기다리는 일을 코드가 아니라 손이 한다: 데이지가 다 자랄 때까지 시간을 보낸 뒤 한 줄씩 실행한다.
  function stepThrough(): ChallengeRun {
    const r = new ChallengeRun(c1, c1.seeds[0], code)
    for (let i = 0; i < 5 && r.status !== 'success'; i++) {
      r.stepOnce()
      for (let n = 0; n < 1000 && r.status === 'running' && r.game.world.state.cells[0].growth < 1; n++) r.advance(STEP_MS)
    }
    return r
  }

  test('화면에서는 성공하지만 같은 코드의 judge 결과는 실패이다', () => {
    const r = stepThrough()
    expect(r.status).toBe('success')
    expect(r.stepped).toBe(true)
    expect(r.score).toBeLessThan(c1.medals.gold)
    const judged = judge(c1, code)
    expect(judged.ok).toBe(false)
    expect(judged.score).toBeNull()
    expect(judged.failedSeed).toBe(c1.seeds[0])
    expect(judged.results[0].reason).toBe('ended')
  })
})

describe('collectJudge', () => {
  const stats = (actions: number) => ({ timeMs: 1000, actions, counts: { move: 0, harvest: actions, plant: 0, water: 0, swap: 0, fail: 0 } })
  const ok = (seed: number, score: number, actions = 10): SeedResult =>
    ({ seed, status: 'success', reason: null, score, stats: stats(actions), errorText: null })
  const bad = (seed: number, reason: FailReason, errorText: string | null = null): SeedResult =>
    ({ seed, status: 'failed', reason, score: null, stats: stats(4), errorText })

  test('모든 배치가 성공하면 기록과 동작 횟수를 더한다', () => {
    const r = collectJudge(c6, [ok(1, 10000, 20), ok(2, 11000, 21), ok(3, 12050, 22)])
    expect(r).toMatchObject({ ok: true, score: 33050, actions: 63, failedSeed: null })
    expect(r.results.map(x => x.seed)).toEqual([1, 2, 3])
  })
  test('배치가 하나인 과제는 그 기록이 그대로 기록이다', () => {
    expect(collectJudge(c1, [ok(1, 8100, 9)])).toMatchObject({ ok: true, score: 8100, actions: 9 })
  })
  test('실패한 배치가 있으면 기록이 없고 처음 실패한 시드를 알린다', () => {
    const r = collectJudge(c6, [ok(1, 10000), bad(2, 'timeout')])
    expect(r).toMatchObject({ ok: false, score: null, failedSeed: 2 })
  })
  test('아직 실행하지 않은 배치가 남아 있으면 성공이 아니다', () => {
    const r = collectJudge(c6, [ok(1, 10000), ok(2, 10000)])
    expect(r.ok).toBe(false)
    expect(r.score).toBeNull()
    expect(r.failedSeed).toBeNull()
  })
  test('과제의 시드 순서로 늘어놓는다', () => {
    expect(collectJudge(c6, [ok(3, 3), ok(1, 1), ok(2, 2)]).results.map(x => x.seed)).toEqual([1, 2, 3])
  })
  test('같은 시드가 두 번 들어오면 먼저 온 것만 쓴다', () => {
    const r = collectJudge(c6, [ok(1, 100, 5), ok(1, 999, 50), ok(2, 200, 6), ok(3, 300, 7)])
    expect(r).toMatchObject({ ok: true, score: 600, actions: 18 })
  })
  test('실패했을 때의 actions는 실행한 배치의 합이다', () => {
    const r = collectJudge(c6, [ok(1, 100, 20), bad(2, 'error', '2번째 줄: 오류')])
    expect(r.actions).toBe(24)
  })
  test('judge의 결과는 배치별 결과를 collectJudge로 모은 것과 같다', () => {
    const solution = SOLUTIONS[c6.id].tuned
    const judged = judge(c6, solution)
    expect(judged).toEqual(collectJudge(c6, c6.seeds.map(seed => runSeed(c6, seed, solution))))
  })
})
