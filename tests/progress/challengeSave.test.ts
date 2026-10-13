import { describe, expect, test } from 'vitest'
import { CHALLENGES } from '../../src/progress/challenges'
import {
  CHALLENGE_KEY, MAX_CODE_CHARS, cleanNickname, countLines, emptyChallengeData, isBetter, loadChallengeData, saveChallengeData,
  type ChallengeData, type ChallengeRecord,
} from '../../src/progress/challengeSave'
import type { StorageLike } from '../../src/progress/save'

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: k => { data.delete(k) } }
}
const [c1, c2] = CHALLENGES
const rec = (score: number, over: Partial<ChallengeRecord> = {}): ChallengeRecord =>
  ({ score, actions: 3, lines: 2, code: 'x = 1', at: 1000, uploaded: false, ...over })
const sample = (): ChallengeData => ({
  version: 1,
  nickname: '인트',
  records: { [c1.id]: rec(c1.minScore + 5), [c2.id]: rec(c2.minScore + 7) },
  drafts: { [c1.id]: 'draft1', [c2.id]: 'draft2' },
  seenIntro: [c1.id],
})
const store = (data: unknown) => {
  const s = memory()
  s.data.set(CHALLENGE_KEY, JSON.stringify(data))
  return s
}

describe('loadChallengeData / saveChallengeData', () => {
  test('저장소가 비어 있으면 빈 데이터', () => {
    expect(loadChallengeData(memory())).toEqual(emptyChallengeData())
  })
  test('왕복 저장', () => {
    const s = memory()
    expect(saveChallengeData(s, sample())).toBe(true)
    expect(loadChallengeData(s)).toEqual(sample())
  })
  test('깨진 JSON은 빈 데이터', () => {
    const s = memory()
    s.data.set(CHALLENGE_KEY, '{not json')
    expect(loadChallengeData(s)).toEqual(emptyChallengeData())
  })
  test('최상위가 객체가 아니거나 version이 다르면 빈 데이터', () => {
    expect(loadChallengeData(store([1]))).toEqual(emptyChallengeData())
    expect(loadChallengeData(store(null))).toEqual(emptyChallengeData())
    expect(loadChallengeData(store({ ...sample(), version: 2 }))).toEqual(emptyChallengeData())
  })
  test('getItem이 예외를 던지면 빈 데이터', () => {
    const s: StorageLike = { getItem: () => { throw new Error('x') }, setItem: () => {}, removeItem: () => {} }
    expect(loadChallengeData(s)).toEqual(emptyChallengeData())
  })
  test('setItem이 예외를 던지면 false', () => {
    const s: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} }
    expect(saveChallengeData(s, sample())).toBe(false)
  })
  test('한 기록만 잘못되면 나머지는 유지', () => {
    const data = sample()
    const bad = { ...data, records: { ...data.records, [c1.id]: { ...rec(5), score: -1 } } }
    const out = loadChallengeData(store(bad))
    expect(out.records).toEqual({ [c2.id]: data.records[c2.id] })
    expect(out.drafts).toEqual(data.drafts)
    expect(out.nickname).toBe('인트')
    expect(out.seenIntro).toEqual([c1.id])
  })
  test('알 수 없는 과제 id의 기록·초안·소개는 버림', () => {
    const data = sample()
    const raw = {
      ...data,
      records: { ...data.records, nope: rec(5) },
      drafts: { ...data.drafts, nope: 'x' },
      seenIntro: [c1.id, 'nope'],
    }
    const out = loadChallengeData(store(raw))
    expect(Object.keys(out.records).sort()).toEqual([c1.id, c2.id].sort())
    expect(Object.keys(out.drafts).sort()).toEqual([c1.id, c2.id].sort())
    expect(out.seenIntro).toEqual([c1.id])
  })
  test('minScore보다 작은 기록은 버림', () => {
    const raw = { ...sample(), records: { [c1.id]: rec(c1.minScore - 1), [c2.id]: rec(c2.minScore) } }
    const out = loadChallengeData(store(raw))
    expect(Object.keys(out.records)).toEqual([c2.id])
  })
  test('기록 필드 형식이 틀리면 그 기록만 버림', () => {
    const base = rec(c1.minScore + 1)
    const bads = [
      { ...base, score: 1.5 }, { ...base, actions: -1 }, { ...base, lines: Number.NaN }, { ...base, code: 5 },
      { ...base, code: 'a'.repeat(MAX_CODE_CHARS + 1) }, { ...base, at: -1 }, { ...base, uploaded: 'yes' },
    ]
    for (const bad of bads) {
      const out = loadChallengeData(store({ ...sample(), records: { [c1.id]: bad, [c2.id]: sample().records[c2.id] } }))
      expect(Object.keys(out.records)).toEqual([c2.id])
    }
  })
  test('잘못된 초안만 버리고 MAX_CODE_CHARS 이하는 유지', () => {
    const raw = { ...sample(), drafts: { [c1.id]: 'a'.repeat(MAX_CODE_CHARS + 1), [c2.id]: 'a'.repeat(MAX_CODE_CHARS) } }
    expect(Object.keys(loadChallengeData(store(raw)).drafts)).toEqual([c2.id])
    expect(Object.keys(loadChallengeData(store({ ...sample(), drafts: { [c1.id]: 3 } })).drafts)).toEqual([])
  })
  test('닉네임이 규칙에 맞지 않으면 null', () => {
    expect(loadChallengeData(store({ ...sample(), nickname: ' 인트 ' })).nickname).toBeNull()
    expect(loadChallengeData(store({ ...sample(), nickname: 'a' })).nickname).toBeNull()
    expect(loadChallengeData(store({ ...sample(), nickname: 5 })).nickname).toBeNull()
  })
  test('MAX_CODE_CHARS를 넘는 초안은 잘라내지 않고 그 항목만 저장하지 않음', () => {
    const s = memory()
    const data = sample()
    data.drafts[c1.id] = 'a'.repeat(MAX_CODE_CHARS + 1)
    expect(saveChallengeData(s, data)).toBe(true)
    const out = loadChallengeData(s)
    expect(out.drafts).toEqual({ [c2.id]: 'draft2' })
  })
})

describe('cleanNickname', () => {
  test.each([
    ['  인트  ', '인트'], ['a', null], ['가나다라마바사아자차', '가나다라마바사아자차'], ['가나다라마바사아자차카', null],
    ['   ', null], ['가  나', '가 나'], ['🙂🙂', '🙂🙂'], ['<b>x</b>', '<b>x</b>'],
    ['가\n나', null], ['가\t나', null], ['가\u200b나', null], ['가\u2028나', null], ['가\u2029나', null],
    ['가\u202e나', null], ['가\u202d나', null], ['가\u200f나', null], ['가\u2066나\u2069', null], // 글자 방향을 바꾸는 글자
  ])('%j', (input, expected) => {
    expect(cleanNickname(input)).toBe(expected)
  })
})

describe('countLines', () => {
  test('빈 줄과 주석 줄은 세지 않는다', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('   \n\t\n')).toBe(0)
    expect(countLines('   # 주석')).toBe(0)
    expect(countLines('x = 1  # 주석')).toBe(1)
    expect(countLines('while True:\n\n    # 수확\n    harvest()\n')).toBe(2)
  })
})

describe('isBetter', () => {
  test('작을수록 좋다', () => {
    expect(isBetter(c1, 100, undefined)).toBe(true)
    expect(isBetter(c1, 100, rec(100))).toBe(false)
    expect(isBetter(c1, 99, rec(100))).toBe(true)
    expect(isBetter(c1, 101, rec(100))).toBe(false)
  })
})
