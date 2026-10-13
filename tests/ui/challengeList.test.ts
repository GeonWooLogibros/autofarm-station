import { describe, expect, test } from 'vitest'
import { CHALLENGES } from '../../src/progress/challenges'
import { emptyChallengeData, type ChallengeData, type ChallengeRecord } from '../../src/progress/challengeSave'
import { cardInfo, markUploaded, medalCount, nicknameBase, pendingUploads, withNickname } from '../../src/ui/challengeList'

const rec = (score: number, uploaded = false): ChallengeRecord => ({ score, actions: 1, lines: 1, code: 'x', at: 1, uploaded })
const def = CHALLENGES[0]
const withRecords = (records: Record<string, ChallengeRecord>, nickname: string | null = '농부'): ChallengeData =>
  ({ ...emptyChallengeData(), nickname, records })

describe('cardInfo', () => {
  test('기록이 없으면 기록 없음과 등급 없음이다', () => {
    expect(cardInfo(def, undefined)).toEqual({ no: def.no, title: def.title, concept: def.concept, best: '기록 없음', medal: null })
  })
  test('기록이 있으면 형식을 갖춘 기록과 등급이다', () => {
    const info = cardInfo(def, rec(def.medals.gold))
    expect(info.best).toBe(`${(def.medals.gold / 1000).toFixed(2)}초`)
    expect(info.medal).toBe('gold')
  })
  test('동 기준에도 못 미치면 기록은 보이고 등급은 없다', () => {
    const info = cardInfo(def, rec(def.medals.bronze + 1))
    expect(info.medal).toBeNull()
    expect(info.best).not.toBe('기록 없음')
  })
})

describe('medalCount', () => {
  test('등급별로 센다', () => {
    const [a, b, c, d] = CHALLENGES
    const data = withRecords({
      [a.id]: rec(a.medals.gold), [b.id]: rec(b.medals.silver), [c.id]: rec(c.medals.bronze), [d.id]: rec(d.medals.bronze + 1),
    })
    expect(medalCount(data)).toEqual({ gold: 1, silver: 1, bronze: 1 })
  })
  test('기록이 없으면 모두 0이다', () => {
    expect(medalCount(emptyChallengeData())).toEqual({ gold: 0, silver: 0, bronze: 0 })
  })
})

describe('pendingUploads', () => {
  const [a, b] = CHALLENGES
  test('닉네임이 없으면 올릴 것이 없다', () => {
    expect(pendingUploads(withRecords({ [a.id]: rec(9000) }, null))).toEqual([])
  })
  test('uploaded가 false인 기록만 고른다', () => {
    const data = withRecords({ [a.id]: rec(9000, false), [b.id]: rec(12000, true) })
    expect(pendingUploads(data)).toEqual([{ id: a.id, record: data.records[a.id] }])
  })
})

describe('nicknameBase', () => {
  const [a] = CHALLENGES
  test('저장할 수 있으면 저장소의 닉네임이 기준이다(다른 탭에서 바꾼 닉네임을 따른다)', () => {
    const stored = withRecords({ [a.id]: rec(9000, true) }, '다른탭')
    expect(nicknameBase(stored, '농부', false)).toBe(stored)
    // 메모리의 닉네임과 같은 이름으로 정해도, 저장소의 닉네임과 다르면 올린 기록을 다시 올리게 된다.
    const next = withNickname(nicknameBase(stored, '농부', false), '농부')
    expect(next.nickname).toBe('농부')
    expect(next.records[a.id].uploaded).toBe(false)
  })
  test('저장소의 닉네임과 같은 이름이면 올린 기록을 그대로 둔다', () => {
    const stored = withRecords({ [a.id]: rec(9000, true) }, '다른탭')
    expect(withNickname(nicknameBase(stored, '농부', false), '다른탭')).toBe(stored)
  })
  test('저장에 실패한 상태이면 메모리의 닉네임이 기준이다', () => {
    const stored = withRecords({ [a.id]: rec(9000, true) }, null)
    expect(nicknameBase(stored, '농부', true)).toEqual({ ...stored, nickname: '농부' })
    expect(withNickname(nicknameBase(stored, '농부', true), '새이름').records[a.id].uploaded).toBe(false)
  })
})

describe('markUploaded', () => {
  const [a] = CHALLENGES
  test('점수가 같으면 uploaded를 true로 바꾼다', () => {
    const data = withRecords({ [a.id]: rec(9000) })
    const next = markUploaded(data, a.id, 9000)
    expect(next.records[a.id].uploaded).toBe(true)
    expect(data.records[a.id].uploaded).toBe(false)
  })
  test('그 사이 기록이 바뀌었으면(점수가 다르면) 그대로 둔다', () => {
    const data = withRecords({ [a.id]: rec(8500) })
    expect(markUploaded(data, a.id, 9000)).toBe(data)
  })
  test('기록이 없으면 그대로 둔다', () => {
    const data = withRecords({})
    expect(markUploaded(data, a.id, 9000)).toBe(data)
  })
})

describe('경계', () => {
  const [a, b] = CHALLENGES
  const stray = (data: ChallengeData): ChallengeData =>
    ({ ...data, records: { ...data.records, 'nope-v1': rec(1, false), 'nope-v2': rec(2, true) } })

  test('CHALLENGES에 없는 키는 올릴 목록과 등급 수에서 무시한다', () => {
    const data = stray(withRecords({ [a.id]: rec(a.medals.gold, false), [b.id]: rec(b.medals.gold, true) }))
    expect(pendingUploads(data).map(t => t.id)).toEqual([a.id])
    expect(medalCount(data)).toEqual({ gold: 2, silver: 0, bronze: 0 })
  })
  test('markUploaded는 다른 과제의 기록과 닉네임을 보존한다', () => {
    const data = withRecords({ [a.id]: rec(9000), [b.id]: rec(12000) }, '농부')
    const next = markUploaded(data, a.id, 9000)
    expect(next.nickname).toBe('농부')
    expect(next.records[b.id]).toBe(data.records[b.id])
    expect(next.records[a.id]).toEqual({ ...data.records[a.id], uploaded: true })
  })
  test('cardInfo는 동 기준과 정확히 같은 점수에서 동을 준다', () => {
    expect(cardInfo(def, rec(def.medals.bronze)).medal).toBe('bronze')
    expect(cardInfo(def, rec(def.medals.silver)).medal).toBe('silver')
  })
})

describe('withNickname', () => {
  const [a, b] = CHALLENGES
  test('처음 정하면 닉네임만 넣는다', () => {
    const data = withRecords({ [a.id]: rec(9000, false) }, null)
    expect(withNickname(data, '농부')).toEqual({ ...data, nickname: '농부' })
  })
  test('바꾸면 올라간 기록도 uploaded를 false로 되돌린다', () => {
    const data = withRecords({ [a.id]: rec(9000, true), [b.id]: rec(12000, false) })
    const next = withNickname(data, '새이름')
    expect(next.nickname).toBe('새이름')
    expect(next.records[a.id].uploaded).toBe(false)
    expect(next.records[b.id].uploaded).toBe(false)
    expect(next.records[a.id].score).toBe(9000)
    expect(data.records[a.id].uploaded).toBe(true)
  })
  test('같은 닉네임이면 그대로 둔다', () => {
    const data = withRecords({ [a.id]: rec(9000, true) })
    expect(withNickname(data, '농부')).toBe(data)
  })
})
