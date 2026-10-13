import { describe, expect, test } from 'vitest'
import { moistureSteps, refillCaption, waterFacts, MOISTURE_STEPS } from '../../src/progress/waterInfo'
import { WATER_DECAY_PER_SEC, WATER_FILL_MS, WATER_GROWTH_BONUS, WATER_PER_USE } from '../../src/sim/balance'
import { unlockDef } from '../../src/progress/unlocks'

describe('물 안내', () => {
  test('충전 문구는 규칙의 값에서 만든다', () => {
    expect(refillCaption()).toBe(`${WATER_FILL_MS / 1000}초마다 +1`)
    expect(refillCaption()).toBe('10초마다 +1')
  })

  test('설명서의 물 설명은 합니다체이고 규칙의 값을 담는다', () => {
    const facts = waterFacts()
    expect(facts.length).toBeGreaterThanOrEqual(4)
    for (const s of facts) {
      expect(s).toMatch(/니다\.$/)
      expect(s).not.toMatch(/[—–`]/)
    }
    const all = facts.join(' ')
    expect(all).toContain(`${WATER_FILL_MS / 1000}초마다 물 1`)
    expect(all).toContain(`최대 ${unlockDef('watering').waterCap}`)
    expect(all).toContain(`수분을 ${WATER_PER_USE}만큼`)
    expect(all).toContain(`${1 + WATER_GROWTH_BONUS}배`)
    expect(all).toContain(`${WATER_DECAY_PER_SEC * 100}%`)
    expect(all).toContain('False')
    expect(all).toContain('비어 있는 채로 시작')
  })

  test('수분을 네 칸으로 나누어 보여 준다', () => {
    expect(MOISTURE_STEPS).toBe(Math.round(1 / WATER_PER_USE))
    expect(moistureSteps(0)).toBe(0)
    expect(moistureSteps(WATER_PER_USE)).toBe(1)
    expect(moistureSteps(WATER_PER_USE * 0.99)).toBe(1) // 물을 준 직후 조금 마른 정도로는 칸이 줄지 않는다
    expect(moistureSteps(0.5)).toBe(2)
    expect(moistureSteps(0.75)).toBe(3)
    expect(moistureSteps(1)).toBe(4)
    expect(moistureSteps(0.1)).toBe(0)
    expect(moistureSteps(NaN)).toBe(0)
    expect(moistureSteps(7)).toBe(4)
    expect(moistureSteps(-1)).toBe(0)
  })
})
