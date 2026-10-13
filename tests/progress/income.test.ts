import { describe, expect, test } from 'vitest'
import { INCOME_WINDOW_MS, IncomeMeter } from '../../src/progress/income'

describe('IncomeMeter', () => {
  test('최근 60초의 합을 자원별로 낸다', () => {
    const m = new IncomeMeter()
    m.add('Daisy', 2, 1000)
    m.add('Daisy', 3, 5000)
    m.add('Coin', 4, 6000)
    expect(m.perMinute(10_000)).toEqual({ Daisy: 5, Coin: 4 })
  })
  test('기록이 없으면 빈 객체', () => {
    expect(new IncomeMeter().perMinute(0)).toEqual({})
  })
  test('정확히 60초 전의 기록은 버리고 직전은 남긴다', () => {
    const m = new IncomeMeter()
    m.add('Daisy', 1, 0)
    m.add('Tulip', 1, 1)
    expect(INCOME_WINDOW_MS).toBe(60_000)
    expect(m.perMinute(INCOME_WINDOW_MS - 1)).toEqual({ Daisy: 1, Tulip: 1 })
    expect(m.perMinute(INCOME_WINDOW_MS)).toEqual({ Tulip: 1 })
  })
  test('0인 자원은 넣지 않는다', () => {
    const m = new IncomeMeter()
    m.add('Daisy', 0, 0)
    expect(m.perMinute(10)).toEqual({})
  })
  test('reset은 모두 비운다', () => {
    const m = new IncomeMeter()
    m.add('Daisy', 1, 0)
    m.reset()
    expect(m.perMinute(10)).toEqual({})
  })
  test('시간이 거꾸로 가면 모두 버린다', () => {
    const m = new IncomeMeter()
    m.add('Daisy', 1, 5000)
    expect(m.perMinute(4000)).toEqual({})
    expect(m.perMinute(6000)).toEqual({})
  })
  test('add만 오래 되풀이해도 오래된 기록은 쌓이지 않는다', () => {
    const m = new IncomeMeter()
    for (let t = 0; t <= 10 * INCOME_WINDOW_MS; t += 1000) m.add('Daisy', 1, t)
    expect(m.size).toBe(INCOME_WINDOW_MS / 1000)
    expect(m.perMinute(10 * INCOME_WINDOW_MS)).toEqual({ Daisy: INCOME_WINDOW_MS / 1000 })
  })
  test('유한하지 않은 amount나 timeMs는 무시한다', () => {
    const m = new IncomeMeter()
    m.add('Daisy', Infinity, 0)
    m.add('Daisy', Number.NaN, 0)
    m.add('Daisy', 1, Infinity)
    m.add('Daisy', 1, Number.NaN)
    expect(m.size).toBe(0)
    expect(m.perMinute(10)).toEqual({})
  })
})
