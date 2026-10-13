import { describe, expect, test } from 'vitest'
import type { Board } from '../../src/online/ranking'
import { CHALLENGES, formatScore, medalFor } from '../../src/progress/challenges'
import type { ChallengeRecord } from '../../src/progress/challengeSave'
import { myLine, myRankText, rankRows } from '../../src/ui/rankingPanel'

const def = CHALLENGES[0]
const rec = (score: number): ChallengeRecord => ({ score, actions: 1, lines: 1, code: 'x', at: 1, uploaded: false })
const board = (scores: [string, number, boolean?][], myRank: number | null = null, myScore: number | null = null): Board =>
  ({ top: scores.map(([nickname, score, mine]) => ({ nickname, score, mine: mine ?? false })), myRank, myScore })

describe('rankRows', () => {
  test('같은 기록은 같은 순위이고 그다음 순위는 건너뛴다', () => {
    const rows = rankRows(def, board([['가', 9000], ['나', 9000], ['다', 9500], ['라', 9500], ['마', 9500], ['바', 9900]]))
    expect(rows.map(r => r.rank)).toEqual([1, 1, 3, 3, 3, 6])
    expect(rows.map(r => r.nickname)).toEqual(['가', '나', '다', '라', '마', '바'])
  })
  test('기록은 과제의 형식으로, 등급은 과제의 기준으로 적는다', () => {
    const rows = rankRows(def, board([['가', def.medals.gold], ['나', def.medals.silver], ['다', def.medals.bronze], ['라', def.medals.bronze + 1]]))
    expect(rows.map(r => r.medal)).toEqual(['gold', 'silver', 'bronze', null])
    expect(rows[0].score).toBe(formatScore(def, def.medals.gold))
  })
  test('내 줄만 mine이다', () => {
    const rows = rankRows(def, board([['가', 9000], ['나', 9100, true], ['다', 9200]]))
    expect(rows.map(r => r.mine)).toEqual([false, true, false])
  })
  test('빈 목록이면 빈 배열이다', () => {
    expect(rankRows(def, board([]))).toEqual([])
  })
})

describe('myRankText', () => {
  test('순위가 있으면 문장으로 적는다', () => {
    expect(myRankText(board([], 37, 9000))).toBe('내 순위 37위')
  })
  test('순위가 없으면 null이다', () => {
    expect(myRankText(board([]))).toBeNull()
  })
})

describe('myLine', () => {
  test('이 브라우저의 기록이 없으면 서버의 내 기록을 적는다', () => {
    const line = myLine(def, board([], 2, def.medals.gold), undefined, '농부')
    expect(line).toEqual({ score: formatScore(def, def.medals.gold), medal: 'gold', note: null })
  })
  test('기록이 어디에도 없으면 기록 없음이다', () => {
    expect(myLine(def, board([]), undefined, '농부')).toEqual({ score: null, medal: null, note: null })
    expect(myLine(def, null, undefined, null)).toEqual({ score: null, medal: null, note: null })
  })
  test('닉네임이 없으면 닉네임을 정하라고 알린다', () => {
    const line = myLine(def, board([['가', 9000]]), rec(9500), null)
    expect(line.score).toBe(formatScore(def, 9500))
    expect(line.note).toBe('닉네임을 정하면 랭킹에 올릴 수 있습니다. 닉네임은 과제 목록 화면에서 정합니다.')
  })
  test('이 브라우저의 기록이 서버의 것보다 좋으면 아직 오르지 않았다고 알린다', () => {
    const note = '이 기록은 아직 랭킹에 오르지 않았습니다. 과제 목록을 열면 다시 올립니다.'
    expect(myLine(def, board([], 3, 9500), rec(9000), '농부')).toEqual({ score: formatScore(def, 9000), medal: medalFor(def, 9000), note })
    expect(myLine(def, board([]), rec(9000), '농부').note).toBe(note)
  })
  test('서버의 기록과 같거나 서버가 더 좋으면 알림이 없고 더 좋은 기록을 적는다', () => {
    expect(myLine(def, board([], 3, 9000), rec(9000), '농부').note).toBeNull()
    const line = myLine(def, board([], 3, 8800), rec(9000), '농부')
    expect(line).toEqual({ score: formatScore(def, 8800), medal: medalFor(def, 8800), note: null })
  })
  test('랭킹에 닿지 않았으면 이 브라우저의 기록만 적는다', () => {
    expect(myLine(def, null, rec(9000), '농부')).toEqual({ score: formatScore(def, 9000), medal: medalFor(def, 9000), note: null })
  })
})
