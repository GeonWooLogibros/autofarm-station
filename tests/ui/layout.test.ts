import { describe, expect, test } from 'vitest'
import { chooseView, makeLayout, rowMinWidth } from '../../src/ui/greenhouse'

const SIZES: [number, number][] = [[1, 1], [3, 1], [3, 3], [4, 4], [6, 6]]

describe('온실 장면의 배치', () => {
  test('선반은 어느 크기에서나 화면 가운데에 놓이고 바닥 위에 선다', () => {
    for (const [viewW, viewH] of [[800, 720], [1010, 720], [1400, 720], [800, 1100], [440, 900]]) {
      for (const [w, h] of SIZES) {
        const L = makeLayout(w, h, viewW, viewH)
        expect(L.gx + (L.c * w) / 2).toBeCloseTo(viewW / 2, 6)
        expect(L.gy + L.c * h + L.bench).toBeCloseTo(L.floorY, 6)
        expect(L.gx).toBeGreaterThanOrEqual(64 - 1e-9)
        expect(L.gy).toBeGreaterThanOrEqual(96 - 1e-9)
        expect(L.bench).toBeGreaterThanOrEqual(12)
      }
    }
  })

  test('작은 선반은 한도까지 키우고 작업대로 받쳐 올린다', () => {
    const small = makeLayout(1, 1, 1010, 720)
    expect(small.c).toBe(176)
    expect(small.bench).toBe(150)
    const big = makeLayout(6, 6, 1010, 720)
    expect(big.c).toBeGreaterThan(78)
    expect(big.bench).toBe(12)
  })

  test('창의 비율에 맞춰 장면의 크기를 고른다', () => {
    expect(chooseView(0, 0, 1, 1, 0)).toEqual({ w: 960, h: 720 })
    expect(chooseView(884, 630, 4, 4, 300)).toEqual({ w: 1010, h: 720 })
    // 세로로 긴 창에서 큰 선반은 더 높은 장면에 그려야 칸이 커진다.
    const tall = chooseView(640, 1000, 6, 6, 300)
    expect(tall.h).toBeGreaterThan(720)
    // 출하장 한 줄이 들어갈 너비보다 좁아지지 않는다.
    const need = rowMinWidth(7, true)
    expect(chooseView(300, 600, 6, 6, need).w).toBeGreaterThanOrEqual(need)
  })

  test('출하장에 칸이 늘면 필요한 너비도 늘어난다', () => {
    expect(rowMinWidth(2, false)).toBeGreaterThan(rowMinWidth(1, false))
    expect(rowMinWidth(1, true)).toBeGreaterThan(rowMinWidth(1, false))
    expect(rowMinWidth(7, true)).toBeLessThan(800)
  })
})
