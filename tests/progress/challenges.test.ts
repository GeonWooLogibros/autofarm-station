import { describe, expect, test } from 'vitest'
import { CHALLENGES, challengeById, formatScore, goalText, medalFor } from '../../src/progress/challenges'
import { sortedCrateGroup } from '../../src/sim/rules'
import { ITEM_KINDS } from '../../src/sim/types'
import { unlockDef } from '../../src/progress/unlocks'

describe('과제 정의', () => {
  test('8개이고 번호와 id가 올바르다', () => {
    expect(CHALLENGES).toHaveLength(8)
    expect(CHALLENGES.map(c => c.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(new Set(CHALLENGES.map(c => c.id)).size).toBe(8)
    for (const c of CHALLENGES) expect(c.id.endsWith('-v1')).toBe(true)
    expect(challengeById('c01-first-v1')?.no).toBe(1)
    expect(challengeById('nope')).toBeUndefined()
  })

  test('setup 결과가 저장 검증 범위 안의 모양이다', () => {
    for (const c of CHALLENGES) {
      for (const seed of c.seeds) {
        const s = c.setup(seed)
        expect(s.cells).toHaveLength(s.w * s.h)
        expect(s.droneX).toBe(0)
        expect(s.droneY).toBe(0)
        expect(s.timeMs).toBe(0)
        expect(s.yieldMult).toEqual({ Daisy: 1, Strawberry: 1, Tulip: 1 })
        for (const k of ITEM_KINDS) expect(Number.isFinite(s.items[k]) && s.items[k] >= 0).toBe(true)
        expect(Number.isInteger(s.rng)).toBe(true)
        for (const cell of s.cells) {
          expect(cell.growth).toBeGreaterThanOrEqual(0)
          expect(cell.growth).toBeLessThanOrEqual(1)
          if (cell.plant === 'Sunflower') {
            expect(cell.value).toBeGreaterThanOrEqual(7)
            expect(cell.value).toBeLessThanOrEqual(15)
          } else if (cell.plant === 'Crate') {
            expect(cell.value).toBeGreaterThanOrEqual(0)
            expect(cell.value).toBeLessThanOrEqual(9)
          } else expect(cell.value).toBe(0)
        }
      }
    }
  })

  test('setup은 매번 새 객체를 돌려주고 시드가 다르면 값이 다르다', () => {
    for (const c of CHALLENGES) {
      const a = c.setup(c.seeds[0])
      const b = c.setup(c.seeds[0])
      expect(a).not.toBe(b)
      expect(a.cells).not.toBe(b.cells)
      expect(a).toEqual(b)
    }
    for (const no of [6, 8]) {
      const c = CHALLENGES[no - 1]
      const vals = (seed: number) => c.setup(seed).cells.map(x => x.value)
      expect(vals(c.seeds[0])).not.toEqual(vals(c.seeds[1]))
      expect(vals(c.seeds[1])).not.toEqual(vals(c.seeds[2]))
    }
  })

  test('메달 기준과 시드 수', () => {
    for (const c of CHALLENGES) {
      expect(c.medals.gold).toBeLessThan(c.medals.silver)
      expect(c.medals.silver).toBeLessThan(c.medals.bronze)
      expect(c.minScore).toBeLessThanOrEqual(c.medals.gold)
      expect([1, 3]).toContain(c.seeds.length)
    }
  })

  test('쓰는 함수와 작물이 unlocks로 열린다', () => {
    const has = (c: typeof CHALLENGES[number], f: (u: ReturnType<typeof unlockDef>) => boolean) => c.unlocks.some(id => f(unlockDef(id)))
    for (const c of CHALLENGES) {
      if (c.goal.item === 'Strawberry' || c.goal.item === 'Tomato') {
        expect(has(c, u => u.names.includes('plant'))).toBe(true)
      }
      if (c.no === 6) expect(has(c, u => u.names.includes('measure'))).toBe(true)
      if (c.no === 8) expect(has(c, u => u.names.includes('swap'))).toBe(true)
    }
  })

  test('medalFor', () => {
    const c = CHALLENGES[0]
    expect(medalFor(c, c.medals.gold)).toBe('gold')
    expect(medalFor(c, c.medals.silver)).toBe('silver')
    expect(medalFor(c, c.medals.bronze)).toBe('bronze')
    expect(medalFor(c, c.medals.bronze + 1)).toBeNull()
  })

  test('formatScore와 goalText', () => {
    expect(formatScore(CHALLENGES[0], 12350)).toBe('12.35초')
    expect(formatScore(CHALLENGES[7], 14)).toBe('14번')
    expect(goalText(CHALLENGES[2])).toBe('딸기 6개 모으기')
    expect(goalText(CHALLENGES[5])).toBe('전력 60 모으기')
    expect(goalText(CHALLENGES[7])).toBe('코인 81개 모으기')
  })

  test('8번은 처음부터 정렬된 배치가 아니다', () => {
    const c = CHALLENGES[7]
    for (const seed of c.seeds) {
      const s = c.setup(seed)
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        expect(sortedCrateGroup(s, x, y)).not.toHaveLength(9)
      }
    }
  })
})
