import { describe, expect, test } from 'vitest'
import { Game } from '../../src/progress/game'
import { formatCount } from '../../src/ui/greenhouse'
import { affordableCount, formatDuration } from '../../src/ui/panels'

describe('formatCount', () => {
  test('1,000보다 작은 수는 그대로 보여 준다', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(12.9)).toBe('12')
  })

  test('큰 수는 천, 만, 억으로 줄이고 버림한다', () => {
    expect(formatCount(1000)).toBe('1천')
    expect(formatCount(1299)).toBe('1.2천')
    expect(formatCount(9999)).toBe('9.9천')
    expect(formatCount(10_000)).toBe('1만')
    expect(formatCount(125_999)).toBe('12.5만')
    expect(formatCount(1_000_000)).toBe('100만')
    expect(formatCount(99_999_999)).toBe('9999만')
    expect(formatCount(250_000_000)).toBe('2.5억')
  })

  test('음수와 숫자가 아닌 값은 0으로 보여 준다', () => {
    expect(formatCount(-5)).toBe('0')
    expect(formatCount(Number.NaN)).toBe('0')
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('0')
  })
})

describe('formatDuration', () => {
  test('초, 분, 시간 단위로 나누어 보여 준다', () => {
    expect(formatDuration(0)).toBe('0초')
    expect(formatDuration(59_999)).toBe('59초')
    expect(formatDuration(60_000)).toBe('1분 0초')
    expect(formatDuration(3_599_000)).toBe('59분 59초')
    expect(formatDuration(3_600_000)).toBe('1시간 0분 0초')
    expect(formatDuration(5_025_000)).toBe('1시간 23분 45초')
  })

  test('음수와 숫자가 아닌 값은 0초로 보여 준다', () => {
    expect(formatDuration(-1000)).toBe('0초')
    expect(formatDuration(Number.NaN)).toBe('0초')
  })
})

describe('affordableCount', () => {
  test('지금 살 수 있는 해금 항목의 수를 센다', () => {
    const g = Game.create(1)
    expect(affordableCount(g)).toBe(0)
    g.world.state.items.Daisy = 5
    expect(affordableCount(g)).toBe(1) // 반복
    g.buy('loop')
    g.world.state.items.Daisy = 30
    expect(affordableCount(g)).toBe(2) // 드론 속도 1, 선반 확장 1
    g.world.state.items.Daisy = 200
    expect(affordableCount(g)).toBe(3) // 데이지 수확량 강화까지
  })
})
