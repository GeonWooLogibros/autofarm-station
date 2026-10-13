import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STEP_MS } from '../../src/progress/challengeRun'
import { CHALLENGES, type ChallengeDef } from '../../src/progress/challenges'
import { speedMultiplier } from '../../src/progress/unlocks'

// firestore.rules의 범위 표('id': { 'min': 숫자, 'max': 숫자, 'step': 숫자 })를 읽어 CHALLENGES와 맞춘다.
// 주석 처리된 줄은 값으로 읽지 않는다.
const rules = readFileSync('firestore.rules', 'utf8').split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n')
const table = new Map<string, { min: number; max: number; step: number }>()
for (const m of rules.matchAll(/'(c\d+-[a-z0-9-]+)'\s*:\s*\{\s*'min'\s*:\s*(\d+)\s*,\s*'max'\s*:\s*(\d+)\s*,\s*'step'\s*:\s*(\d+)\s*\}/g)) {
  table.set(m[1], { min: Number(m[2]), max: Number(m[3]), step: Number(m[4]) })
}
// 드론의 동작 하나는 속도 배율이 1일 때 500ms가 걸린다.
const ACTION_MS = 500
// 횟수로 재는 과제의 상한: 제한 시간 동안 할 수 있는 동작의 수 × 시드 수. 과제의 속도 배율을 반영한다.
const countMax = (c: ChallengeDef): number => Math.floor(c.limitMs / (ACTION_MS / speedMultiplier(new Set(c.unlocks)))) * c.seeds.length

describe('firestore.rules 범위 표', () => {
  it('모든 과제의 minScore가 표에 같은 값으로 있다', () => {
    for (const c of CHALLENGES) expect(table.get(c.id)?.min, c.id).toBe(c.minScore)
  })
  it('상한은 시간 과제이면 제한 시간 × 시드 수이고 횟수 과제이면 제한 시간 안에 할 수 있는 동작의 수 × 시드 수이다', () => {
    for (const c of CHALLENGES) {
      expect(table.get(c.id)?.max, c.id).toBe(c.metric.kind === 'time' ? c.limitMs * c.seeds.length : countMax(c))
    }
  })
  it('8번 과제의 상한은 540이다', () => {
    expect(table.get('c08-crate-v1')?.max).toBe(540)
  })
  it('시간 과제의 score는 50의 배수이고(step 50) 횟수 과제는 아니다(step 1)', () => {
    expect(STEP_MS).toBe(50)
    for (const c of CHALLENGES) expect(table.get(c.id)?.step, c.id).toBe(c.metric.kind === 'time' ? STEP_MS : 1)
  })
  it('하한과 등급 기준은 표의 범위 안에 있고 step의 배수이다', () => {
    for (const c of CHALLENGES) {
      const range = table.get(c.id)!
      for (const score of [c.minScore, c.medals.gold, c.medals.silver, c.medals.bronze]) {
        expect(score >= range.min && score <= range.max && score % range.step === 0, `${c.id} ${score}`).toBe(true)
      }
    }
  })
  it('표에 CHALLENGES에 없는 id가 없다', () => {
    const ids = new Set(CHALLENGES.map(c => c.id))
    expect(table.size).toBe(CHALLENGES.length)
    for (const id of table.keys()) expect(ids.has(id), id).toBe(true)
  })
})
