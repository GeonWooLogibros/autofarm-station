import { describe, expect, test } from 'vitest'
import { costText, plantCostRows, shortageText, subjectParticle } from '../../src/progress/plantCost'
import { PLANT_COST, plantCost } from '../../src/sim/balance'
import { ITEM_KINDS, PLANT_KINDS } from '../../src/sim/types'
import { ITEM_LABEL } from '../../src/progress/droneApi'
import type { UnlockId } from '../../src/progress/unlocks'

describe('심는 비용 표시', () => {
  test('plantCost는 PLANT_COST를 순서 있는 목록으로 바꾼다', () => {
    expect(plantCost('Daisy')).toEqual([])
    expect(plantCost('Strawberry')).toEqual([{ item: 'Daisy', amount: 1 }])
    expect(plantCost('Tulip')).toEqual([{ item: 'Daisy', amount: 2 }])
    for (const kind of PLANT_KINDS) {
      const back = Object.fromEntries(plantCost(kind).map(c => [c.item, c.amount]))
      expect(back, kind).toEqual(PLANT_COST[kind])
    }
  })

  test('해금한 작물 가운데 값이 드는 작물만 줄로 만든다', () => {
    expect(plantCostRows(new Set<UnlockId>())).toEqual([])
    expect(plantCostRows(new Set<UnlockId>(['loop', 'expand1', 'cond']))).toEqual([])
    expect(plantCostRows(new Set<UnlockId>(['strawberry']))).toEqual([
      { plant: 'Strawberry', cost: [{ item: 'Daisy', amount: 1 }] },
    ])
    // 해금한 순서와 상관없이 작물의 순서대로 놓인다.
    expect(plantCostRows(new Set<UnlockId>(['tomato', 'tulip', 'strawberry'])).map(r => r.plant))
      .toEqual(['Strawberry', 'Tulip', 'Tomato'])
    const all = plantCostRows(new Set<UnlockId>(['strawberry', 'tulip', 'sunflower', 'tomato', 'crate']))
    expect(all.map(r => r.plant)).toEqual(['Strawberry', 'Tulip', 'Sunflower', 'Tomato', 'Crate'])
    for (const row of all) expect(row.cost, row.plant).toEqual(plantCost(row.plant))
  })

  test('비용을 글로 적는다', () => {
    expect(costText(plantCost('Strawberry'))).toBe('데이지 1')
    expect(costText(plantCost('Tulip'))).toBe('데이지 2')
    expect(costText([{ item: 'Tulip', amount: 1 }, { item: 'Strawberry', amount: 3 }])).toBe('튤립 1, 딸기 3')
  })

  test('받침에 맞는 조사를 고른다', () => {
    expect(subjectParticle('데이지')).toBe('가')
    expect(subjectParticle('딸기')).toBe('가')
    expect(subjectParticle('튤립')).toBe('이')
    expect(subjectParticle('토마토')).toBe('가')
    expect(subjectParticle('해바라기')).toBe('가')
    expect(subjectParticle('과일 상자')).toBe('가')
    expect(subjectParticle('전력')).toBe('이')
    expect(subjectParticle('코인')).toBe('이')
    expect(subjectParticle('물')).toBe('이')
  })

  test('모자란 자원을 알리는 문구', () => {
    expect(shortageText(['Daisy'])).toBe('데이지가 부족합니다')
    expect(shortageText(['Strawberry'])).toBe('딸기가 부족합니다')
    expect(shortageText(['Tulip'])).toBe('튤립이 부족합니다')
    expect(shortageText(['Tomato'])).toBe('토마토가 부족합니다')
    expect(shortageText(['Daisy', 'Tulip'])).toBe('데이지, 튤립이 부족합니다')
    expect(shortageText([])).toBe('')
    for (const k of ITEM_KINDS) expect(shortageText([k])).toContain(ITEM_LABEL[k])
  })
})
