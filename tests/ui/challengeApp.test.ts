import { describe, expect, test } from 'vitest'
import type { JudgeResult, SeedResult } from '../../src/progress/challengeJudge'
import { FAIL_TEXT, type FailReason } from '../../src/progress/challengeRun'
import { CHALLENGES, challengeById } from '../../src/progress/challenges'
import { emptyChallengeData, type ChallengeRecord } from '../../src/progress/challengeSave'
import { ITEM_KINDS, type ItemKind } from '../../src/sim/types'
import {
  SPEEDS, STEP_ONLY_TEXT, batchLabel, betterRecord, capEvents, failNote, initialCode, medalReach, nextMedalText, recordOutcome,
  resultView, statusLine, uploadPlan, uploadText, visibleCargo,
} from '../../src/ui/challengeApp'

const first = CHALLENGES[0] // 시간, 시드 1개
const sunflower = challengeById('c06-sunflower-v1')! // 시간, 시드 3개
const crate = challengeById('c08-crate-v1')! // 횟수, 시드 3개

const stats = (actions: number) => ({ timeMs: 1000, actions, counts: { move: 0, harvest: actions, plant: 0, water: 0, swap: 0, fail: 0 } })
const ok = (seed: number, score: number, actions = 10): SeedResult =>
  ({ seed, status: 'success', reason: null, score, stats: stats(actions), errorText: null })
const bad = (seed: number, reason: FailReason, errorText: string | null = null): SeedResult =>
  ({ seed, status: 'failed', reason, score: null, stats: stats(4), errorText })
const judged = (score: number, actions = 12): JudgeResult =>
  ({ ok: true, score, actions, results: [ok(1, score, actions)], failedSeed: null })
const rec = (score: number): ChallengeRecord => ({ score, actions: 1, lines: 1, code: 'x', at: 1, uploaded: false })

describe('SPEEDS', () => {
  test('1배, 4배, 16배이다', () => {
    expect([...SPEEDS]).toEqual([1, 4, 16])
  })
})

describe('resultView', () => {
  test('이전 기록이 없으면 차이는 없고 최고 기록이다', () => {
    expect(resultView(first, judged(8100, 9), 2, undefined)).toEqual({
      score: '8.10초', medal: 'gold', actions: 9, lines: 2, delta: null, isBest: true,
    })
  })
  test('이전 기록보다 빠르면 단축한 시간을 적는다', () => {
    const view = resultView(first, judged(8100), 2, rec(8950))
    expect(view.delta).toBe('0.85초 단축')
    expect(view.isBest).toBe(true)
  })
  test('이전 기록보다 느리면 느린 만큼을 적고 최고 기록이 아니다', () => {
    const view = resultView(first, judged(9300), 2, rec(8100))
    expect(view.delta).toBe('1.20초 느림')
    expect(view.isBest).toBe(false)
    expect(view.medal).toBe('bronze')
  })
  test('이전 기록과 같으면 같다고 적고 최고 기록이 아니다', () => {
    const view = resultView(first, judged(8100), 2, rec(8100))
    expect(view.delta).toBe('이전 기록과 같음')
    expect(view.isBest).toBe(false)
  })
  test('동 기준에 못 미치면 등급이 없다', () => {
    expect(resultView(first, judged(first.medals.bronze + 50), 2, undefined).medal).toBeNull()
  })
  test('횟수 과제는 번으로 적는다', () => {
    expect(resultView(crate, judged(24), 30, rec(26))).toMatchObject({ score: '24번', medal: 'gold', delta: '2번 줄임', isBest: true })
    expect(resultView(crate, judged(29), 30, rec(26))).toMatchObject({ score: '29번', medal: 'silver', delta: '3번 늘어남', isBest: false })
    expect(resultView(crate, judged(26), 30, rec(26)).delta).toBe('이전 기록과 같음')
  })
})

describe('nextMedalText', () => {
  test('금을 받았으면 없다', () => {
    expect(nextMedalText(first, first.medals.gold)).toBeNull()
  })
  test('한 단계 위의 등급까지 남은 차이를 적는다', () => {
    expect(nextMedalText(first, 9300)).toBe('은 기준까지 0.35초')
    expect(nextMedalText(first, 8900)).toBe('금 기준까지 0.80초')
    expect(nextMedalText(first, 12000)).toBe('동 기준까지 1.45초')
  })
  test('횟수 과제는 번으로 적는다', () => {
    expect(nextMedalText(crate, 28)).toBe('금 기준까지 2번')
  })
})

describe('medalReach', () => {
  test('지금 값이 기준 이하인 등급만 아직 받을 수 있다', () => {
    expect(medalReach(first, 0)).toEqual({ gold: true, silver: true, bronze: true })
    expect(medalReach(first, first.medals.gold)).toEqual({ gold: true, silver: true, bronze: true })
    expect(medalReach(first, first.medals.gold + 50)).toEqual({ gold: false, silver: true, bronze: true })
    expect(medalReach(first, first.medals.silver + 50)).toEqual({ gold: false, silver: false, bronze: true })
    expect(medalReach(first, first.medals.bronze + 50)).toEqual({ gold: false, silver: false, bronze: false })
  })
  test('횟수 과제는 횟수로 본다', () => {
    expect(medalReach(crate, 27)).toEqual({ gold: false, silver: true, bronze: true })
  })
})

describe('recordOutcome', () => {
  const all = (score: number): JudgeResult => ({ ok: true, score: score * 3, actions: 30, results: [ok(1, score), ok(2, score), ok(3, score)], failedSeed: null })
  const failedAt = (seed: number): JudgeResult => {
    const results = sunflower.seeds.filter(s => s <= seed).map(s => (s === seed ? bad(s, 'ended') : ok(s, 10000)))
    return { ok: false, score: null, actions: 0, results, failedSeed: seed }
  }
  test('화면의 실행이 실패했으면 아무것도 하지 않는다', () => {
    expect(recordOutcome(first, { ok: false, stepped: false }, null)).toEqual({ kind: 'none' })
    expect(recordOutcome(first, { ok: false, stepped: true }, judged(8100))).toEqual({ kind: 'none' })
  })
  test('심사가 아직 없으면 아무것도 하지 않는다', () => {
    expect(recordOutcome(first, { ok: true, stepped: false }, null)).toEqual({ kind: 'none' })
  })
  test('실행하기만 썼고 심사가 성공이면 심사의 결과를 기록으로 쓴다', () => {
    const j = judged(8100)
    expect(recordOutcome(first, { ok: true, stepped: false }, j)).toEqual({ kind: 'result', judged: j, rerun: false })
  })
  test('한 단계 실행을 썼고 심사도 성공이면 심사의 결과를 기록으로 쓰고 그 사실을 알린다', () => {
    const j = all(11000)
    const out = recordOutcome(sunflower, { ok: true, stepped: true }, j)
    expect(out).toEqual({ kind: 'result', judged: j, rerun: true })
  })
  test('한 단계 실행으로 목표에 닿았지만 처음부터 실행하면 실패하는 경우에는 기록 없이 안내만 한다', () => {
    const j: JudgeResult = { ok: false, score: null, actions: 4, results: [bad(1, 'ended')], failedSeed: 1 }
    expect(recordOutcome(first, { ok: true, stepped: true }, j)).toEqual({ kind: 'stepOnly' })
    expect(recordOutcome(sunflower, { ok: true, stepped: true }, failedAt(1))).toEqual({ kind: 'stepOnly' })
    expect(STEP_ONLY_TEXT).toBe('한 단계 실행으로는 목표를 채웠지만, 실행하기로 처음부터 끝까지 실행하면 목표를 채우지 못합니다. 기록은 실행하기로 성공해야 남습니다.')
  })
  test('다른 배치에서 실패하면 한 단계 실행을 썼든 아니든 그 배치를 알린다', () => {
    for (const stepped of [false, true]) {
      const j = failedAt(2)
      expect(recordOutcome(sunflower, { ok: true, stepped }, j)).toEqual({ kind: 'batchFail', failed: j.results[1] })
    }
  })
  test('한 단계 실행을 쓰지 않았는데 첫 배치의 심사가 실패하면 화면과 심사가 어긋난 것으로 알린다', () => {
    const j = failedAt(1)
    expect(recordOutcome(sunflower, { ok: true, stepped: false }, j)).toEqual({ kind: 'mismatch', failed: j.results[0] })
    const single: JudgeResult = { ok: false, score: null, actions: 4, results: [bad(1, 'ended')], failedSeed: 1 }
    expect(recordOutcome(first, { ok: true, stepped: false }, single)).toEqual({ kind: 'mismatch', failed: single.results[0] })
  })
  test('실패한 배치 없이 덜 끝난 심사는 기록으로 쓰지 않는다', () => {
    const j: JudgeResult = { ok: false, score: null, actions: 20, results: [ok(1, 10000), ok(2, 10000)], failedSeed: null }
    expect(recordOutcome(sunflower, { ok: true, stepped: false }, j)).toEqual({ kind: 'none' })
  })
})

describe('failNote', () => {
  test('첫 배치의 실패는 까닭만 적는다', () => {
    for (const reason of ['timeout', 'error', 'ended', 'stopped'] as const) {
      expect(failNote(sunflower, bad(1, reason))).toBe(FAIL_TEXT[reason])
    }
  })
  test('다른 배치의 실패는 다른 배치라는 것과 까닭을 함께 적는다', () => {
    expect(failNote(sunflower, bad(2, 'timeout'))).toBe(`다른 배치에서는 목표에 도달하지 못했습니다. ${FAIL_TEXT.timeout}`)
    expect(failNote(sunflower, bad(3, 'ended'))).toContain(FAIL_TEXT.ended)
  })
})

describe('batchLabel', () => {
  test('배치가 하나인 과제에는 없다', () => {
    expect(batchLabel(first, 1)).toBe('')
  })
  test('배치가 세 개인 과제는 몇 번째인지 적는다', () => {
    expect(batchLabel(crate, 9)).toBe('배치 1 / 3')
    expect(batchLabel(crate, 15)).toBe('배치 3 / 3')
  })
})

describe('uploadText', () => {
  test('상태마다 한 문장이다', () => {
    expect(uploadText('sending')).toBe('랭킹에 올리는 중입니다.')
    expect(uploadText('sent')).toBe('랭킹에 올렸습니다.')
    expect(uploadText('failed')).toBe('랭킹에 올리지 못했습니다. 기록은 이 브라우저에 저장했고 다음에 다시 올립니다.')
    expect(uploadText('nonick')).toBe('닉네임을 정하면 랭킹에 올릴 수 있습니다.')
    expect(uploadText('none')).toBe('')
  })
  test('그 밖의 상태도 합니다체 문장이다', () => {
    for (const state of ['offline', 'toolong', 'unsaved'] as const) expect(uploadText(state)).toMatch(/니다\.$/)
  })
})

describe('initialCode', () => {
  test('초안, 최고 기록의 코드, 처음 코드의 순서로 고른다', () => {
    const data = emptyChallengeData()
    expect(initialCode(data, first.id)).toBe('harvest()\n')
    data.records[first.id] = { ...rec(8100), code: 'best()' }
    expect(initialCode(data, first.id)).toBe('best()')
    data.drafts[first.id] = 'draft()'
    expect(initialCode(data, first.id)).toBe('draft()')
    expect(initialCode(data, crate.id)).toBe('harvest()\n')
  })
  test('빈 초안도 초안이다', () => {
    const data = emptyChallengeData()
    data.records[first.id] = { ...rec(8100), code: 'best()' }
    data.drafts[first.id] = ''
    expect(initialCode(data, first.id)).toBe('')
  })
})

describe('capEvents', () => {
  test('적으면 그대로, 많으면 마지막 것만 남긴다', () => {
    const few = [1, 2, 3]
    expect(capEvents(few, 5)).toBe(few)
    expect(capEvents([1, 2, 3, 4, 5, 6], 4)).toEqual([3, 4, 5, 6])
  })
})

describe('visibleCargo', () => {
  const items = (over: Partial<Record<ItemKind, number>> = {}): Record<ItemKind, number> => {
    const all = {} as Record<ItemKind, number>
    for (const k of ITEM_KINDS) all[k] = over[k] ?? 0
    return all
  }
  test('목표 자원은 가진 것이 없어도 보인다', () => {
    expect(visibleCargo('Coin', items(), [])).toEqual(['Coin'])
  })
  test('가지고 있는 자원도 보인다', () => {
    expect(visibleCargo('Strawberry', items({ Daisy: 30 }), [])).toEqual(['Daisy', 'Strawberry'])
  })
  test('한 번 보인 자원은 다 써도 남는다', () => {
    const before = visibleCargo('Tomato', items({ Tulip: 60 }), [])
    expect(before).toEqual(['Tulip', 'Tomato'])
    expect(visibleCargo('Tomato', items(), before)).toEqual(['Tulip', 'Tomato'])
  })
  test('도중에 얻은 자원이 더해진다', () => {
    expect(visibleCargo('Power', items({ Daisy: 0.5 }), ['Power'])).toEqual(['Daisy', 'Power'])
  })
  test('물은 물탱크로 보이므로 넣지 않는다', () => {
    expect(visibleCargo('Strawberry', items({ Water: 10 }), [])).toEqual(['Strawberry'])
  })
  test('달라진 것이 없으면 받은 목록을 그대로 돌려준다', () => {
    const seen = visibleCargo('Coin', items(), [])
    expect(visibleCargo('Coin', items(), seen)).toBe(seen)
  })
})

describe('betterRecord', () => {
  test('한쪽만 있으면 그것이다', () => {
    const a = rec(8100)
    expect(betterRecord(a, undefined)).toBe(a)
    expect(betterRecord(undefined, a)).toBe(a)
    expect(betterRecord(undefined, undefined)).toBeUndefined()
  })
  test('기록이 더 작은 쪽이다', () => {
    const fast = rec(8100)
    const slow = rec(9000)
    expect(betterRecord(fast, slow)).toBe(fast)
    expect(betterRecord(slow, fast)).toBe(fast)
  })
  test('기록이 같으면 저장소의 것을 쓴다(올렸다는 표시를 잃지 않는다)', () => {
    const memory = rec(8100)
    const stored = { ...rec(8100), uploaded: true }
    expect(betterRecord(memory, stored)).toBe(stored)
  })
})

describe('uploadPlan', () => {
  const base = { tooLong: false, saved: true, enabled: true, nickname: '농부' as string | null }
  test('랭킹이 켜져 있고 닉네임이 있으면 올린다', () => {
    expect(uploadPlan(base)).toBe('sending')
  })
  test('저장하지 못해도 올리기는 한다', () => {
    expect(uploadPlan({ ...base, saved: false })).toBe('sending')
  })
  test('코드가 너무 길면 올리지 않는다', () => {
    expect(uploadPlan({ ...base, tooLong: true })).toBe('toolong')
  })
  test('올릴 수 없으면 까닭을 알린다', () => {
    expect(uploadPlan({ ...base, nickname: null })).toBe('nonick')
    expect(uploadPlan({ ...base, enabled: false })).toBe('offline')
    expect(uploadPlan({ ...base, enabled: false, saved: false })).toBe('unsaved')
    expect(uploadPlan({ ...base, nickname: null, saved: false })).toBe('unsaved')
  })
})

describe('경계와 드문 입력', () => {
  test('failNote: 까닭이 없으면 첫 배치는 빈 문장, 다른 배치는 다른 배치라는 문장만이다', () => {
    const noReason = (seed: number): SeedResult => ({ ...bad(seed, 'ended'), reason: null })
    expect(failNote(sunflower, noReason(1))).toBe('')
    expect(failNote(sunflower, noReason(2))).toBe('다른 배치에서는 목표에 도달하지 못했습니다.')
  })
  test('medalReach: 은·동 기준과 정확히 같은 값은 아직 받을 수 있다', () => {
    expect(medalReach(first, first.medals.silver)).toEqual({ gold: false, silver: true, bronze: true })
    expect(medalReach(first, first.medals.bronze)).toEqual({ gold: false, silver: false, bronze: true })
    expect(medalReach(crate, crate.medals.bronze)).toEqual({ gold: false, silver: false, bronze: true })
  })
  test('nextMedalText: 은·동 기준과 정확히 같은 기록은 그 등급이고 다음 등급까지의 차이를 적는다', () => {
    expect(nextMedalText(first, first.medals.silver)).toBe(`금 기준까지 ${((first.medals.silver - first.medals.gold) / 1000).toFixed(2)}초`)
    expect(nextMedalText(first, first.medals.bronze)).toBe(`은 기준까지 ${((first.medals.bronze - first.medals.silver) / 1000).toFixed(2)}초`)
    expect(nextMedalText(crate, crate.medals.bronze)).toBe(`은 기준까지 ${crate.medals.bronze - crate.medals.silver}번`)
  })
})

describe('statusLine', () => {
  const base = { judging: false, batches: 1, status: 'ready' as const, paused: false, canResume: false, replaying: false, edited: false, noted: false, batch: '' }
  test('실행 전에는 비어 있다', () => {
    expect(statusLine(base)).toBe('')
  })
  test('심사 중이면 다른 것보다 먼저 알린다', () => {
    expect(statusLine({ ...base, status: 'success', judging: true })).toBe('기록을 확인하는 중입니다.')
    expect(statusLine({ ...base, status: 'success', judging: true, batches: 3 })).toBe('배치 3개에서 기록을 확인하는 중입니다.')
  })
  test('성공하면 목표를 채웠다고 알린다', () => {
    expect(statusLine({ ...base, status: 'success' })).toBe('목표를 채웠습니다.')
  })
  test('성공했지만 다른 문장(다른 배치의 실패 등)이 있으면 비운다', () => {
    expect(statusLine({ ...base, status: 'success', noted: true })).toBe('')
  })
  test('다시 보기에서 목표에 닿으면 기록에 쓰지 않는다고 알린다', () => {
    expect(statusLine({ ...base, status: 'success', replaying: true, batch: '배치 2 / 3' }))
      .toBe('다시 보기에서는 목표를 채웠습니다. 이 실행은 기록에 쓰지 않습니다.')
  })
  test('실패하면 비운다(까닭은 따로 적는다)', () => {
    expect(statusLine({ ...base, status: 'failed' })).toBe('')
  })
  test('실행 중의 문장', () => {
    const running = { ...base, status: 'running' as const }
    expect(statusLine(running)).toBe('실행 중입니다.')
    expect(statusLine({ ...running, edited: true })).toBe('코드를 고쳤습니다. 다시 실행하면 적용됩니다.')
    expect(statusLine({ ...running, paused: true, canResume: true })).toBe('멈췄습니다. 실행하기를 누르면 이어서 실행합니다.')
    expect(statusLine({ ...running, paused: true })).toBe('코드를 고쳤습니다. 실행하기를 누르면 고친 코드로 처음부터 실행합니다.')
    expect(statusLine({ ...running, replaying: true, batch: '배치 2 / 3' })).toBe('배치 2 / 3를 다시 보는 중입니다. 이 실행은 기록에 쓰지 않습니다.')
  })
})
