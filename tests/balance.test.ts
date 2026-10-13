import { describe, expect, test } from 'vitest'
import { Game, MAX_FRAME_MS } from '../src/progress/game'
import { UNLOCK_ORDER, unlockDef, type UnlockId } from '../src/progress/unlocks'
import { BUY_ORDER, MODEL } from './model/scripts'

// Game.tick이 한 번에 받아들이는 가장 긴 시간이다. 안에서는 50ms 단위로 나누어 계산하므로 결과는 프레임 길이와 거의 무관하다.
const FRAME = MAX_FRAME_MS
const MINUTE = 60000
const MAX_PER_UNLOCK = 12 * MINUTE
const TOTAL_MIN = 40 * MINUTE
const TOTAL_MAX = 120 * MINUTE
const TOTAL_GOAL = 70 * MINUTE // 실제 플레이어는 모범 플레이어보다 느리므로 이 안에 들어오게 조정한다

interface Result { g: Game; times: { id: UnlockId; ms: number }[]; errors: string[] }

// 모범 플레이어: 해금 항목을 BUY_ORDER 순서대로 구입하고, 구입한 항목에 맞는 모범 코드로 바꿔 실행한다.
function playThrough(seed: number): Result {
  const g = Game.create(seed)
  const times: { id: UnlockId; ms: number }[] = []
  const errors: string[] = []
  let stage = MODEL[0]
  const start = () => {
    g.stop()
    g.code = stage.code
    if (!g.run()) errors.push(`${stage.from}: ${g.output.at(-1)!.text}`)
  }
  start()
  for (const id of BUY_ORDER) {
    const began = g.playMs
    while (!g.canBuy(id)) {
      if (errors.length > 0) return { g, times, errors }
      g.tick(FRAME)
      if (g.status === 'error') { errors.push(`${stage.from}: ${g.output.at(-1)!.text}`); return { g, times, errors } }
      if (g.status === 'idle') start() // 끝나는 코드는 플레이어가 다시 실행한다
      if (g.playMs - began > MAX_PER_UNLOCK * 2) { errors.push(`${id}: 시간 초과`); return { g, times, errors } }
    }
    g.buy(id)
    times.push({ id, ms: g.playMs - began })
    const next = MODEL.find(m => m.from === id)
    if (next) { stage = next; start() }
    else if (unlockDef(id).size) start() // 선반이 넓어지면 플레이어가 코드를 다시 실행한다
  }
  return { g, times, errors }
}

const minutes = (ms: number) => (ms / MINUTE).toFixed(1)

function report(seed: number, r: Result): string {
  const rows = r.times.map(t => `${t.id} ${minutes(t.ms)}분`)
  return [`시드 ${seed}`, ...rows, `합계 ${minutes(r.g.playMs)}분`].join('\n')
}

describe('균형', () => {
  const seeds = [1, 12345]
  const results = new Map<number, Result>()
  const play = (seed: number): Result => {
    let r = results.get(seed)
    if (!r) { r = playThrough(seed); results.set(seed, r) }
    return r
  }

  test('구입 순서는 모든 항목을 한 번씩 포함한다', () => {
    expect([...BUY_ORDER].sort()).toEqual([...UNLOCK_ORDER].sort())
  })

  test('모범 코드의 단계는 구입 순서를 따른다', () => {
    const order = ['start', ...BUY_ORDER]
    const at = MODEL.map(m => order.indexOf(m.from))
    expect(at[0]).toBe(0)
    expect(at).toEqual([...at].sort((a, b) => a - b))
    expect(new Set(at).size).toBe(at.length)
  })

  test.each(seeds)('시드 %i: 모범 코드가 오류 없이 엔딩까지 진행한다', seed => {
    const r = play(seed)
    expect(r.errors, report(seed, r)).toEqual([])
    expect(r.g.finishedAtMs).not.toBeNull()
  })

  test.each(seeds)('시드 %i: 어느 해금 항목도 12분을 넘기지 않는다', seed => {
    const r = play(seed)
    const slow = r.times.filter(t => t.ms > MAX_PER_UNLOCK).map(t => `${t.id}: ${minutes(t.ms)}분`)
    expect(slow, report(seed, r)).toEqual([])
  })

  test.each(seeds)('시드 %i: 엔딩까지 40분에서 70분이 걸린다', seed => {
    const r = play(seed)
    if (import.meta.env.VITE_BALANCE_LOG) console.log(report(seed, r))
    const total = r.g.finishedAtMs!
    expect(total, report(seed, r)).toBeGreaterThanOrEqual(TOTAL_MIN)
    expect(total, report(seed, r)).toBeLessThanOrEqual(TOTAL_MAX)
    expect(total, report(seed, r)).toBeLessThanOrEqual(TOTAL_GOAL)
  })
}, 120000)
