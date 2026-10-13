import { describe, expect, test } from 'vitest'
import type { RankingService, Submission, SubmitResult } from '../../src/online/ranking'
import { isUploading, queueSubmit, uploadsSettled } from '../../src/online/uploads'
import { emptyChallengeData, type ChallengeData } from '../../src/progress/challengeSave'
import { markUploaded } from '../../src/ui/challengeList'

const sub = (challengeId: string, score: number): Submission => ({ challengeId, nickname: '농부', score, actions: 1, lines: 1, code: `# ${score}` })
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms))

// 서버 흉내. 쓰기 하나가 delayMs 걸리고, 더 좋은 점수만 받아들인다.
// dedupe: 진행 중이면 앞선 올리기의 Promise를 그대로 돌려준다(고치기 전의 Firebase 구현).
// chain: 앞선 올리기가 끝난 뒤에 이어서 올린다.
function fakeServer(style: 'dedupe' | 'chain', delayMs = 20) {
  const written: number[] = []
  let best: number | null = null
  let running: Promise<SubmitResult> | null = null
  let overlap = false
  let inFlight = 0
  const write = async (s: Submission): Promise<SubmitResult> => {
    if (++inFlight > 1) overlap = true
    await tick(delayMs)
    inFlight--
    if (best !== null && s.score >= best) return 'kept'
    best = s.score
    written.push(s.score)
    return 'ok'
  }
  const ranking: RankingService = {
    enabled: true,
    board: async () => null,
    submit(s) {
      if (style === 'dedupe') {
        if (running) return running
        const p = write(s).finally(() => { running = null })
        running = p
        return p
      }
      const p = (running ?? Promise.resolve('ok' as SubmitResult)).then(() => write(s))
      running = p
      return p
    },
  }
  return { ranking, written, best: () => best, overlapped: () => overlap }
}

describe.each(['dedupe', 'chain'] as const)('queueSubmit (%s 방식의 서비스)', style => {
  test('느린 기록을 올리는 중에 더 좋은 기록을 올려도 둘 다 서버에 가고 결과는 각자의 것이다', async () => {
    const id = `q1-${style}`
    const server = fakeServer(style)
    const slow = queueSubmit(server.ranking, sub(id, 20300))
    const fast = queueSubmit(server.ranking, sub(id, 15550))
    expect(isUploading(id)).toBe(true)
    expect(await slow).toBe('ok')
    // 앞선 올리기가 끝나도 뒤의 올리기가 남아 있는 동안에는 올리는 중이다.
    expect(isUploading(id)).toBe(true)
    expect(await fast).toBe('ok')
    expect(server.written).toEqual([20300, 15550])
    expect(server.overlapped()).toBe(false)
    expect(isUploading(id)).toBe(false)
  })

  test('화면이 하는 대로 결과를 저장하면, 서버에 간 점수와 올렸다는 표시가 맞는다', async () => {
    const id = 'c03-ripe-v1'
    const server = fakeServer(style)
    const record = (score: number) => ({ score, actions: 1, lines: 1, code: 'x', at: 1, uploaded: false })
    let data: ChallengeData = { ...emptyChallengeData(), nickname: '농부', records: { [id]: record(20300) } }
    const done = async (p: Promise<SubmitResult>, score: number) => { if ((await p) !== 'failed') data = markUploaded(data, id, score) }
    const first = done(queueSubmit(server.ranking, sub(id, 20300)), 20300)
    data = { ...data, records: { [id]: record(15550) } } // 올리는 중에 더 좋은 기록을 세웠다
    const second = done(queueSubmit(server.ranking, sub(id, 15550)), 15550)
    await first
    expect(data.records[id]).toMatchObject({ score: 15550, uploaded: false }) // 아직 새 기록은 가지 않았다
    await second
    expect(data.records[id]).toMatchObject({ score: 15550, uploaded: true })
    expect(server.best()).toBe(15550)
  })

  test('더 나쁜 기록이 뒤에 오면 kept이다', async () => {
    const id = `q3-${style}`
    const server = fakeServer(style)
    const results = await Promise.all([queueSubmit(server.ranking, sub(id, 9000)), queueSubmit(server.ranking, sub(id, 9500))])
    expect(results).toEqual(['ok', 'kept'])
    expect(server.written).toEqual([9000])
  })
})

describe('queueSubmit', () => {
  test('과제가 다르면 기다리지 않는다', async () => {
    const log: string[] = []
    const ranking: RankingService = {
      enabled: true,
      board: async () => null,
      async submit(s) { log.push(`시작 ${s.challengeId}`); await tick(10); log.push(`끝 ${s.challengeId}`); return 'ok' },
    }
    await Promise.all([queueSubmit(ranking, sub('qa', 1)), queueSubmit(ranking, sub('qb', 2))])
    expect(log).toEqual(['시작 qa', '시작 qb', '끝 qa', '끝 qb'])
  })

  test('같은 과제는 앞선 올리기가 끝난 뒤에 시작한다', async () => {
    const log: string[] = []
    const ranking: RankingService = {
      enabled: true,
      board: async () => null,
      async submit(s) { log.push(`시작 ${s.score}`); await tick(10); log.push(`끝 ${s.score}`); return 'ok' },
    }
    await Promise.all([queueSubmit(ranking, sub('qc', 1)), queueSubmit(ranking, sub('qc', 2))])
    expect(log).toEqual(['시작 1', '끝 1', '시작 2', '끝 2'])
  })

  test('서비스가 예외를 던지거나 거부해도 failed로 끝나고 올리는 중 표시가 지워진다', async () => {
    const thrower: RankingService = { enabled: true, board: async () => null, submit() { throw new Error('boom') } }
    const rejecter: RankingService = { enabled: true, board: async () => null, submit: () => Promise.reject(new Error('boom')) }
    expect(await queueSubmit(thrower, sub('qe', 1))).toBe('failed')
    expect(await queueSubmit(rejecter, sub('qe', 1))).toBe('failed')
    expect(isUploading('qe')).toBe(false)
    // 실패한 뒤의 올리기도 정상으로 처리된다
    const server = fakeServer('chain')
    expect(await queueSubmit(server.ranking, sub('qe', 5))).toBe('ok')
  })

  test('올리지 않는 과제는 올리는 중이 아니다', () => {
    expect(isUploading('없는 과제')).toBe(false)
  })
})

describe('uploadsSettled', () => {
  test('올리는 것이 없으면 곧바로 끝난다', async () => {
    await uploadsSettled('없는 과제')
  })

  test('그 과제의 올리기가 모두 끝난 뒤에 끝난다. 기다리는 동안 줄에 선 것도 기다린다', async () => {
    const server = fakeServer('chain')
    const first = queueSubmit(server.ranking, sub('qs', 9500))
    let settled = false
    const waiting = uploadsSettled('qs').then(() => { settled = true })
    const second = queueSubmit(server.ranking, sub('qs', 9000))
    await first
    await tick()
    expect(settled).toBe(false)
    await second
    await waiting
    expect(settled).toBe(true)
    expect(isUploading('qs')).toBe(false)
    expect(server.written).toEqual([9500, 9000])
  })

  test('다른 과제의 올리기는 기다리지 않는다', async () => {
    const server = fakeServer('chain', 30)
    const other = queueSubmit(server.ranking, sub('qt', 1))
    await uploadsSettled('qu')
    expect(isUploading('qt')).toBe(true)
    await other
  })

  test('올리기가 실패해도 끝난다', async () => {
    const rejecter: RankingService = { enabled: true, board: async () => null, submit: () => Promise.reject(new Error('boom')) }
    const p = queueSubmit(rejecter, sub('qv', 1))
    await uploadsSettled('qv')
    expect(await p).toBe('failed')
  })
})
