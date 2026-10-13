import { WATER_DECAY_PER_SEC, WATER_FILL_MS, WATER_GROWTH_BONUS, WATER_PER_USE } from '../sim/balance'
import { unlockDef } from './unlocks'

// 화분의 수분을 나누어 보여 주는 칸 수. water() 한 번이 한 칸이다.
export const MOISTURE_STEPS = Math.round(1 / WATER_PER_USE)

// 수분(0~1)을 채워진 칸 수로 바꾼다. 가장 가까운 칸으로 맞추므로, 물을 준 직후 조금 마른 정도로는 칸이 줄지 않는다.
export function moistureSteps(water: number): number {
  if (!Number.isFinite(water)) return 0
  return Math.min(MOISTURE_STEPS, Math.max(0, Math.round(water / WATER_PER_USE)))
}

// 물탱크 아래에 적는 충전 주기. 예: '10초마다 +1'
export function refillCaption(): string {
  return `${WATER_FILL_MS / 1000}초마다 +1`
}

// 설명서의 '물' 항목. 숫자는 모두 규칙의 값에서 가져온다.
export function waterFacts(): string[] {
  const cap = unlockDef('watering').waterCap ?? 0
  return [
    `물탱크는 비어 있는 채로 시작하고, ${WATER_FILL_MS / 1000}초마다 물 1이 채워집니다.`,
    `물은 최대 ${cap}까지 저장되며, 가득 차면 더 채워지지 않습니다.`,
    `water()를 한 번 실행하면 물 1을 써서 화분의 수분을 ${WATER_PER_USE}만큼 올립니다. 수분은 1까지 올라갑니다.`,
    `수분이 1인 화분의 작물은 ${1 + WATER_GROWTH_BONUS}배 빨리 자랍니다. 수분은 1초에 ${WATER_DECAY_PER_SEC * 100}%씩 줄어듭니다.`,
    '물탱크가 비어 있으면 water()는 물을 주지 못하고 False를 돌려줍니다.',
  ]
}
