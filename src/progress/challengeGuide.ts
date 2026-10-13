import { formatScore, goalText, type ChallengeDef } from './challenges'
import { WATER_FILL_MS } from '../sim/balance'
import { GUIDES, type GuideEntry } from './guide'
import { waterFacts } from './waterInfo'

// 과제를 처음 열 때 인트가 하는 설명. 과제의 설명 문장에 등급 기준과 제한 시간을 덧붙인다. 예제 코드는 주지 않는다.
export function challengeIntro(def: ChallengeDef): GuideEntry {
  const { gold, silver, bronze } = def.medals
  const bound = def.metric.kind === 'time' ? '이내' : '이하'
  const limit = `${def.limitMs / 1000}초`
  return {
    id: 'start', // 과제의 안내는 해금 항목이 아니다
    title: def.title,
    body: [
      ...def.brief,
      `등급 기준은 금 ${formatScore(def, gold)}, 은 ${formatScore(def, silver)}, 동 ${formatScore(def, bronze)} ${bound}입니다.`,
      def.seeds.length > 1
        ? `제한 시간은 배치마다 ${limit}이며, 그 안에 목표를 채우지 못하면 실패합니다.`
        : `제한 시간은 ${limit}이며, 그 안에 목표를 채우지 못하면 실패합니다.`,
    ],
    example: '',
    goal: goalText(def),
  }
}

// 본편에서 항목을 해금한 직후의 일을 말하는 문장. 과제에서는 선반의 크기가 과제마다 정해져 있고 해금이 없으므로 맞지 않는다.
const MAIN_ONLY = [/^선반이 .*넓어졌습니다\.$/, /정지한 다음 다시 실행/, /해금/, /엔딩/]

// 본편의 물탱크는 비어 있는 채로 시작하지만 과제는 처음 값이 정해져 있다. 이 문장은 과제의 값으로 바꿔 적는다.
const STARTS_EMPTY = /^물탱크는 비어 있는 채로 시작/

// 물탱크의 처음 값과 용량은 과제의 처음 상태에서, 채워지는 주기는 규칙에서 가져온다.
export function challengeWaterLine(def: ChallengeDef): string {
  const start = def.setup(def.seeds[0])
  const water = Math.floor(start.items.Water)
  const rest = `${WATER_FILL_MS / 1000}초마다 1씩 채워져 ${start.waterCap}까지 찹니다.`
  return water > 0 ? `물탱크에는 물이 ${water} 들어 있고, ${rest}` : `물탱크는 비어 있는 채로 시작하고, ${rest}`
}

// 설명서의 '물' 항목. 본편의 처음 값과 용량을 말하는 앞의 두 문장을 과제의 값으로 바꾼다.
export function challengeWaterFacts(def: ChallengeDef): string[] {
  return [challengeWaterLine(def), '물탱크가 가득 차면 더 채워지지 않습니다.', ...waterFacts().slice(2)]
}

// 과제의 설명서에 넣을 항목. 본편의 첫 안내 대신 과제의 설명이 맨 위에 오고, 그 과제에서 쓸 수 있는 항목이 뒤따른다.
// 본편에서 해 볼 것(goal)은 과제와 상관이 없으므로 비운다.
export function challengeManual(def: ChallengeDef): GuideEntry[] {
  const usable = GUIDES.filter(g => g.id !== 'start' && def.unlocks.includes(g.id))
  return [
    challengeIntro(def),
    ...usable.map(g => ({
      ...g,
      body: g.body
        .filter(sentence => !MAIN_ONLY.some(re => re.test(sentence)))
        .map(sentence => (STARTS_EMPTY.test(sentence) ? challengeWaterLine(def) : sentence)),
      goal: '',
    })),
  ]
}
