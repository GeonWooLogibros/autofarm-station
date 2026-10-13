import { describe, expect, test } from 'vitest'
import { CHALLENGES, medalFor, type ChallengeDef } from '../src/progress/challenges'
import { judge, type JudgeResult } from '../src/progress/challengeJudge'
import { C5_NO_WATER, SOLUTIONS } from './model/challengeSolutions'

// 등급 기준과 제한 시간을 정하는 규칙. 과제의 조건이나 본편의 수치를 바꾸어 이 테스트가 실패하면,
// 기준 풀이의 기록을 다시 재어 src/progress/challenges.ts의 값을 이 규칙대로 고친다.
const GOLD_MARGIN = 1.08
const BRONZE_MARGIN = 1.15
const CLOSE = 0.1 // 두 풀이의 차이가 이보다 작으면 풀이가 하나뿐인 과제로 본다
const LIMIT_FACTOR = 3
const MIN_LIMIT = 60000

const cache = new Map<string, JudgeResult>()
function run(def: ChallengeDef, code: string): JudgeResult {
  const key = `${def.id}\n${code}`
  let r = cache.get(key)
  if (!r) { r = judge(def, code); cache.set(key, r) }
  return r
}
const simple = (def: ChallengeDef) => run(def, SOLUTIONS[def.id].simple)
const tuned = (def: ChallengeDef) => run(def, SOLUTIONS[def.id].tuned)
const gap = (def: ChallengeDef) => (simple(def).score! - tuned(def).score!) / simple(def).score!

// 시간은 50의 배수로, 횟수는 정수로 올린다. 곱셈의 오차로 한 단계 더 올라가지 않게 먼저 반올림한다.
function roundUp(def: ChallengeDef, value: number): number {
  const unit = def.metric.kind === 'time' ? 50 : 1
  return Math.ceil(Math.round(value * 1000) / 1000 / unit) * unit
}

// 3×3 상자 배치를 전부 탐색하여 정렬에 필요한 가장 적은 swap 횟수를 구한다.
function fewestSwaps(start: number[]): number {
  const pairs: [number, number][] = []
  for (let i = 0; i < 9; i++) {
    if (i % 3 < 2) pairs.push([i, i + 1])
    if (i < 6) pairs.push([i, i + 3])
  }
  const seen = new Set<string>([start.join('')])
  let frontier = [start]
  for (let depth = 0; frontier.length > 0; depth++) {
    const next: number[][] = []
    for (const a of frontier) {
      if (pairs.every(([i, j]) => a[i] <= a[j])) return depth
      for (const [i, j] of pairs) {
        if (a[i] === a[j]) continue
        const b = a.slice()
        b[i] = a[j]
        b[j] = a[i]
        const key = b.join('')
        if (!seen.has(key)) { seen.add(key); next.push(b) }
      }
    }
    frontier = next
  }
  throw new Error('정렬된 배치에 닿지 못했습니다.')
}

describe('과제 균형', () => {
  test('기준 풀이가 모두 있다', () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual(CHALLENGES.map(c => c.id).sort())
  })

  for (const def of CHALLENGES) {
    describe(`${def.no}번 ${def.title}`, () => {
      test('두 풀이가 그 과제의 unlocks만으로 모든 시드에서 성공한다', () => {
        for (const r of [simple(def), tuned(def)]) {
          expect(r.results.map(x => x.errorText)).toEqual(def.seeds.map(() => null))
          expect(r.ok).toBe(true)
        }
      })

      test('잘 다듬은 풀이는 금이고 단순한 풀이도 등급을 받는다', () => {
        expect(medalFor(def, tuned(def).score!)).toBe('gold')
        expect(medalFor(def, simple(def).score!)).not.toBeNull()
        expect(tuned(def).score!).toBeLessThanOrEqual(simple(def).score!)
      })

      test('등급 기준이 기준 풀이의 기록에서 나온 값이다', () => {
        const t = tuned(def).score!
        const s = simple(def).score!
        if (gap(def) < CLOSE) {
          expect(def.medals).toEqual({ gold: t, silver: roundUp(def, t * 1.1), bronze: roundUp(def, t * 1.3) })
        } else {
          const gold = roundUp(def, t * GOLD_MARGIN)
          const bronze = roundUp(def, s * BRONZE_MARGIN)
          expect(def.medals).toEqual({ gold, silver: roundUp(def, (gold + bronze) / 2), bronze })
        }
      })

      test('하한은 잘 다듬은 풀이의 기록 이하이다', () => {
        expect(def.minScore).toBeLessThanOrEqual(tuned(def).score!)
      })

      test('제한 시간은 단순한 풀이가 시드 하나에 쓴 시간의 3배이다', () => {
        const longest = Math.max(...simple(def).results.map(r => r.stats.timeMs))
        expect(def.limitMs).toBe(Math.max(MIN_LIMIT, Math.ceil(longest * LIMIT_FACTOR / 10000) * 10000))
        expect(longest).toBeLessThanOrEqual(def.limitMs / 2)
      })
    })
  }

  test('풀이가 여럿인 과제는 두 풀이의 기록이 뚜렷하게 다르고, 한 번의 도전이 너무 짧거나 길지 않다', () => {
    for (const def of CHALLENGES.filter(c => c.no >= 3)) {
      expect(gap(def), def.id).toBeGreaterThanOrEqual(CLOSE)
      for (const r of simple(def).results) {
        expect(r.stats.timeMs, def.id).toBeGreaterThanOrEqual(20000)
        expect(r.stats.timeMs, def.id).toBeLessThanOrEqual(120000)
      }
    }
  })

  test('5번: 물을 쓰지 않는 풀이는 금을 받지 못한다', () => {
    const def = CHALLENGES[4]
    const r = run(def, C5_NO_WATER)
    expect(r.ok).toBe(true)
    expect(r.results[0].stats.counts.water).toBe(0)
    expect(medalFor(def, r.score!)).not.toBe('gold')
    expect(tuned(def).results[0].stats.counts.water).toBeGreaterThan(0)
  })

  test('8번: 하한은 전부 탐색하여 구한 가장 적은 swap 횟수의 합이다', () => {
    const def = CHALLENGES[7]
    const fewest = def.seeds.map(seed => fewestSwaps(def.setup(seed).cells.map(c => c.value)))
    expect(def.minScore).toBe(fewest.reduce((a, b) => a + b, 0))
    // 기준 풀이보다 적은 횟수로 푸는 방법이 남아 있어야 랭킹에서 겨룰 거리가 있다.
    expect(def.minScore).toBeLessThan(tuned(def).score!)
  })
})
