import { plantCost } from '../sim/balance'
import { PLANT_KINDS, type CostEntry, type ItemKind, type PlantKind } from '../sim/types'
import { ITEM_LABEL } from './droneApi'
import { unlockedPlants, type UnlockId } from './unlocks'

export interface PlantCostRow { plant: PlantKind; cost: CostEntry[] }

// 해금한 작물 가운데 심을 때 값이 드는 작물과 그 값. 설명서의 '심는 비용'에 쓴다.
export function plantCostRows(unlocked: Set<UnlockId>): PlantCostRow[] {
  const plants = unlockedPlants(unlocked)
  return PLANT_KINDS
    .filter(plant => plants.has(plant))
    .map(plant => ({ plant, cost: plantCost(plant) }))
    .filter(row => row.cost.length > 0)
}

// '데이지 1'처럼 자원의 이름과 수를 적는다.
export function costText(cost: CostEntry[]): string {
  return cost.map(c => `${ITEM_LABEL[c.item]} ${c.amount}`).join(', ')
}

// 낱말의 마지막 글자에 받침이 있으면 '이', 없으면 '가'를 고른다.
export function subjectParticle(word: string): '이' | '가' {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가'
}

// 심지 못한 화분 위에 띄우는 문구. 예: '데이지가 부족합니다'
export function shortageText(items: ItemKind[]): string {
  if (items.length === 0) return ''
  const names = items.map(k => ITEM_LABEL[k])
  return `${names.join(', ')}${subjectParticle(names[names.length - 1])} 부족합니다`
}
