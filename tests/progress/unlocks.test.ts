import { describe, expect, test } from 'vitest'
import { UNLOCKS, UNLOCK_ORDER, canBuy, featureTitles, speedMultiplier, unlockDef, unlockedFeatures, unlockedPlants, type UnlockId } from '../../src/progress/unlocks'
import { ALL_FEATURES } from '../../src/lang/checker'
import { ITEM_KINDS, type ItemKind } from '../../src/sim/types'

const items = (over: Partial<Record<ItemKind, number>> = {}) =>
  Object.assign(Object.fromEntries(ITEM_KINDS.map(k => [k, 0])), over) as Record<ItemKind, number>

describe('해금 정의', () => {
  test('항목은 23개이고 id가 겹치지 않는다', () => {
    expect(UNLOCKS.length).toBe(23)
    expect(new Set(UNLOCKS.map(u => u.id)).size).toBe(23)
    expect(UNLOCK_ORDER).toEqual(UNLOCKS.map(u => u.id))
  })

  test('선행 항목은 모두 목록에서 자신보다 앞에 있다', () => {
    for (const u of UNLOCKS) for (const r of u.requires) {
      expect(UNLOCK_ORDER.indexOf(r)).toBeLessThan(UNLOCK_ORDER.indexOf(u.id))
    }
  })

  test('모든 문법이 어떤 항목에서든 해금된다', () => {
    expect([...unlockedFeatures(new Set(UNLOCK_ORDER))].sort()).toEqual([...ALL_FEATURES].sort())
    const titles = featureTitles()
    expect(titles.loop).toBe('반복')
    expect(titles.cond).toBe('조건문')
    expect(titles.dict).toBe('딕셔너리')
  })

  test('비용을 내려면 그 자원을 얻을 수 있는 항목이 이미 해금되어 있어야 한다', () => {
    const source: Partial<Record<ItemKind, UnlockId | null>> = {
      Daisy: null, Strawberry: 'strawberry', Tulip: 'tulip', Power: 'sunflower', Tomato: 'tomato', Coin: 'crate',
    }
    const ancestors = (id: UnlockId): Set<UnlockId> => {
      const out = new Set<UnlockId>()
      const walk = (x: UnlockId) => { for (const r of unlockDef(x).requires) { if (!out.has(r)) { out.add(r); walk(r) } } }
      walk(id)
      return out
    }
    for (const u of UNLOCKS) for (const k of Object.keys(u.cost) as ItemKind[]) {
      const need = source[k]
      expect(need, `${u.id}의 비용 ${k}`).not.toBeUndefined()
      if (need) expect(ancestors(u.id).has(need) || u.id === need, `${u.id}는 ${need} 뒤에 와야 합니다`).toBe(true)
    }
  })

  test('제목과 설명이 비어 있지 않다', () => {
    for (const u of UNLOCKS) {
      expect(u.title.length).toBeGreaterThan(0)
      expect(u.summary).toMatch(/니다\.$/)
    }
  })
})

describe('구입 조건', () => {
  test('비용과 선행 항목을 모두 충족해야 한다', () => {
    expect(canBuy(new Set(), items({ Daisy: 5 }), 'loop')).toBe(true)
    expect(canBuy(new Set(), items({ Daisy: 4 }), 'loop')).toBe(false)
    expect(canBuy(new Set(), items({ Daisy: 999 }), 'expand1')).toBe(false)
    expect(canBuy(new Set(['loop']), items({ Daisy: 999 }), 'expand1')).toBe(true)
  })

  test('이미 해금한 항목은 다시 살 수 없다', () => {
    expect(canBuy(new Set(['loop']), items({ Daisy: 999 }), 'loop')).toBe(false)
  })
})

describe('해금 효과', () => {
  test('작물과 속도', () => {
    expect([...unlockedPlants(new Set())]).toEqual(['Daisy'])
    expect(unlockedPlants(new Set(['strawberry', 'tulip'] as UnlockId[])).has('Tulip')).toBe(true)
    expect(speedMultiplier(new Set())).toBe(1)
    expect(speedMultiplier(new Set(['speed1'] as UnlockId[]))).toBe(1.5)
    expect(speedMultiplier(new Set(['speed1', 'speed2'] as UnlockId[]))).toBe(2)
  })

  test('선반 확장은 1×1 → 3×1 → 3×3 → 4×4 → 6×6 순서이다', () => {
    expect(['expand1', 'expand2', 'expand3', 'expand4'].map(id => unlockDef(id as UnlockId).size)).toEqual([
      { w: 3, h: 1 }, { w: 3, h: 3 }, { w: 4, h: 4 }, { w: 6, h: 6 },
    ])
  })
})
