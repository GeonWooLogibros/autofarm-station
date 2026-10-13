import { describe, expect, it, vi } from 'vitest'
import { createRanking } from '../../src/online'
import { offlineRanking, withTimeout } from '../../src/online/ranking'

describe('offlineRanking', () => {
  it('꺼져 있고, 올리기는 failed, 순위판은 null이다', async () => {
    expect(offlineRanking.enabled).toBe(false)
    const s = { challengeId: 'c01-first-v1', nickname: '농부', score: 9000, actions: 1, lines: 1, code: 'x' }
    expect(await offlineRanking.submit(s)).toBe('failed')
    expect(await offlineRanking.board('c01-first-v1')).toBeNull()
  })
})

describe('withTimeout', () => {
  it('제때 끝나면 그 값을 돌려준다', async () => {
    expect(await withTimeout(Promise.resolve(1), 100, 0)).toBe(1)
  })
  it('늦으면 fallback을 돌려준다', async () => {
    vi.useFakeTimers()
    const late = new Promise<number>(r => setTimeout(() => r(1), 10_000))
    const out = withTimeout(late, 8000, -1)
    await vi.advanceTimersByTimeAsync(8000)
    expect(await out).toBe(-1)
    vi.useRealTimers()
  })
  it('거부되면 fallback을 돌려준다', async () => {
    expect(await withTimeout(Promise.reject(new Error('x')), 100, -1)).toBe(-1)
  })
})

describe('createRanking', () => {
  it('설정값이 null이면 꺼진 서비스이다', () => {
    expect(createRanking().enabled).toBe(false)
  })
})
