import { nextRandom } from '../sim/rng'
import { sortedCrateGroup } from '../sim/rules'
import { ITEM_KINDS } from '../sim/types'
import type { Cell, ItemKind, PlantKind, WorldState } from '../sim/types'
import { ITEM_LABEL } from './droneApi'
import type { UnlockId } from './unlocks'

export type Medal = 'bronze' | 'silver' | 'gold'
export type Metric = { kind: 'time' } | { kind: 'count'; event: 'swap' }

export interface ChallengeDef {
  id: string // 판 번호 포함. 예: 'c01-first-v1'
  no: number // 1부터
  title: string
  concept: string // 예: '반복'
  brief: string[] // 인트가 설명하는 문장(합니다체). 목표, 규칙, 재는 것을 담는다
  unlocks: UnlockId[] // 쓸 수 있는 문법·함수·작물·드론 속도
  goal: { item: ItemKind; amount: number }
  metric: Metric
  limitMs: number // 시드 하나의 제한 시간
  medals: { gold: number; silver: number; bronze: number } // 기록이 이 값 이하이면 그 등급
  minScore: number // 보안 규칙에 쓰는 하한. 이론상 가능한 가장 좋은 기록 이하여야 한다
  seeds: number[] // 길이 1 또는 3
  setup(seed: number): WorldState
}

const THREE_SEEDS = '배치가 다른 세 번의 실행을 모두 성공해야 하며 기록은 세 번의 합입니다.'

const grown = (plant: PlantKind, value = 0): Cell => ({ plant, growth: 1, water: 0, wilted: false, value })
const empty = (): Cell => ({ plant: null, growth: 0, water: 0, wilted: false, value: 0 })

function makeState(
  w: number, h: number, seed: number, cell: (i: number) => Cell, items: Partial<Record<ItemKind, number>> = {}, waterCap = 0,
): WorldState {
  const full = {} as Record<ItemKind, number>
  for (const k of ITEM_KINDS) full[k] = items[k] ?? 0
  return {
    w, h,
    cells: Array.from({ length: w * h }, (_, i) => cell(i)),
    droneX: 0, droneY: 0,
    items: full,
    waterCap, waterTimerMs: 0,
    powerActions: 0,
    yieldMult: { Daisy: 1, Strawberry: 1, Tulip: 1 },
    rng: seed, timeMs: 0,
  }
}

// 시드에서 뽑은 값의 배열. 칸마다 lo~hi 사이의 정수 하나
function drawValues(seed: number, count: number, lo: number, hi: number): number[] {
  let state = seed
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const r = nextRandom(state)
    state = r.state
    out.push(lo + Math.floor(r.value * (hi - lo + 1)))
  }
  return out
}

// 상자 무게 9개. 처음부터 전부 정렬된 배치는 나오지 않게 시드에서 이어서 다시 뽑는다.
function crateWeights(seed: number): number[] {
  for (let s = seed; ; s += 1000) {
    const weights = drawValues(s, 9, 0, 9)
    const state = makeState(3, 3, seed, i => grown('Crate', weights[i]))
    if (sortedCrateGroup(state, 0, 0).length !== 9) return weights
  }
}

// 등급 기준과 제한 시간은 기준 풀이(tests/model/challengeSolutions.ts)의 기록으로 정한 값이다.
// 과제의 조건이나 본편의 수치를 바꾸면 tests/challengeBalance.test.ts로 다시 확인한다.
// minScore 옆의 주석은 그보다 좋은 기록이 나올 수 없는 까닭이다.

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'c01-first-v1', no: 1, title: '첫 수확', concept: '반복',
    brief: [
      '다 자란 데이지가 한 포기 있습니다. 데이지를 5개 모으면 성공입니다.',
      '수확한 칸에는 새 데이지가 싹을 틔우고 다시 자라야 합니다. 목표를 채울 때까지 걸린 시간을 재며, 빠를수록 좋습니다.',
    ],
    unlocks: ['loop'],
    goal: { item: 'Daisy', amount: 5 },
    metric: { kind: 'time' },
    limitMs: 60000, medals: { gold: 8100, silver: 8950, bronze: 10550 }, seeds: [1],
    minScore: 8000, // 한 칸에서 5번 수확하려면 데이지가 2초씩 네 번 다시 자라야 한다
    setup: seed => makeState(1, 1, seed, () => grown('Daisy')),
  },
  {
    id: 'c02-row-v1', no: 2, title: '한 줄 훑기', concept: '이동',
    brief: [
      '가로 3칸에 다 자란 데이지가 있습니다. 데이지를 12개 모으면 성공입니다.',
      '드론은 가장자리를 넘어가면 반대편으로 이어집니다. 목표를 채울 때까지 걸린 시간을 재며, 빠를수록 좋습니다.',
    ],
    unlocks: ['loop', 'expand1'],
    goal: { item: 'Daisy', amount: 12 },
    metric: { kind: 'time' },
    limitMs: 60000, medals: { gold: 11100, silver: 12250, bronze: 14450 }, seeds: [1],
    minScore: 11000, // 수확과 다음 수확 사이에는 이동 한 번(합쳐 1초)이나 다시 자라는 2초가 든다. 11번 × 1초
    setup: seed => makeState(3, 1, seed, () => grown('Daisy')),
  },
  {
    id: 'c03-ripe-v1', no: 3, title: '익은 것만', concept: '조건문',
    brief: [
      '가로 3칸이 비어 있고 데이지 10개를 가지고 있습니다. 딸기를 6개 모으면 성공입니다.',
      '덜 자란 딸기를 수확하면 딸기가 사라집니다. 목표를 채울 때까지 걸린 시간을 재며, 빠를수록 좋습니다.',
    ],
    unlocks: ['loop', 'expand1', 'cond', 'strawberry'],
    goal: { item: 'Strawberry', amount: 6 },
    metric: { kind: 'time' },
    limitMs: 70000, medals: { gold: 16800, silver: 20100, bronze: 23350 }, seeds: [1],
    minScore: 12500, // 세 칸에서 6개를 얻으려면 어느 칸은 두 번 길러야 한다. 6초 + 수확 0.5초 + 6초
    setup: seed => makeState(3, 1, seed, empty, { Daisy: 10 }),
  },
  {
    id: 'c04-grid-v1', no: 4, title: '격자 훑기', concept: 'for, 좌표',
    brief: [
      '3×3 선반에 다 자란 데이지가 가득합니다. 데이지를 40개 모으면 성공입니다.',
      '드론은 가장자리를 넘어가면 반대편으로 이어집니다. 목표를 채울 때까지 걸린 시간을 재며, 빠를수록 좋습니다.',
    ],
    unlocks: ['loop', 'expand1', 'cond', 'var', 'func', 'for', 'speed2'],
    goal: { item: 'Daisy', amount: 40 },
    metric: { kind: 'time' },
    limitMs: 70000, medals: { gold: 21250, silver: 23850, bronze: 26450 }, seeds: [1],
    minScore: 19500, // 수확과 다음 수확 사이에는 이동 한 번(합쳐 0.5초)이나 다시 자라는 2초가 든다. 39번 × 0.5초
    setup: seed => makeState(3, 3, seed, () => grown('Daisy')),
  },
  {
    id: 'c05-water-v1', no: 5, title: '물 관리', concept: '물, 변수',
    brief: [
      '가로 3칸이 비어 있고 데이지 30개와 물 10을 가지고 있습니다. 딸기를 15개 모으면 성공입니다.',
      '물탱크는 시간이 지나면 조금씩 다시 차며, 물을 준 식물은 더 빨리 자랍니다. 덜 자란 딸기를 수확하면 딸기가 사라집니다. 목표를 채울 때까지 걸린 시간을 재며, 빠를수록 좋습니다.',
    ],
    unlocks: ['loop', 'expand1', 'cond', 'strawberry', 'watering', 'var'],
    goal: { item: 'Strawberry', amount: 15 },
    metric: { kind: 'time' },
    limitMs: 110000, medals: { gold: 27150, silver: 34550, bronze: 41900 }, seeds: [1],
    minScore: 14500, // 마지막 수확보다 먼저 심기 15번과 수확 14번을 해야 한다. 29번 × 0.5초
    setup: seed => makeState(3, 1, seed, empty, { Daisy: 30, Water: 10 }, 20),
  },
  {
    id: 'c06-sunflower-v1', no: 6, title: '가장 큰 해바라기', concept: '리스트, 최댓값',
    brief: [
      '6×6 선반에 다 자란 해바라기 36송이가 있고, 꽃잎 수는 해바라기마다 다릅니다. 전력을 60 모으면 성공입니다.',
      '다 자란 해바라기가 10송이 이상일 때 꽃잎이 가장 많은 것을 수확하면 전력을 8 얻고, 그 밖에는 1을 얻습니다. 전력을 가지고 있는 동안에는 드론이 두 배로 빨라지며, 전력은 동작 30번마다 1씩 줄어듭니다.',
      '이 과제에서는 작물을 심을 수 없습니다. 목표를 채울 때까지 걸린 시간을 재며, 빠를수록 좋습니다.',
      THREE_SEEDS,
    ],
    unlocks: ['loop', 'expand1', 'cond', 'var', 'func', 'for', 'sunflower', 'list'],
    goal: { item: 'Power', amount: 60 },
    metric: { kind: 'time' },
    limitMs: 100000, medals: { gold: 34750, silver: 71350, bronze: 107900 }, seeds: [1, 2, 3],
    minScore: 10500, // 60을 모으려면 수확 8번과 그 사이의 이동 7번이 필요하다. 가장 빠를 때 동작 하나가 0.25초이므로 시드마다 3.5초
    setup: seed => {
      const petals = drawValues(seed, 36, 7, 15)
      return makeState(6, 6, seed, i => grown('Sunflower', petals[i]))
    },
  },
  {
    id: 'c07-tomato-v1', no: 7, title: '토마토 군집', concept: '격자 탐색',
    brief: [
      '4×4 선반이 비어 있고 튤립 60개를 가지고 있습니다. 토마토를 100개 모으면 성공입니다.',
      '토마토는 다 자란 정사각형 무리를 한꺼번에 수확하며, 무리가 클수록 얻는 양이 크게 늘어납니다. 다 자란 토마토는 시들 수 있습니다. 시든 토마토는 수확할 수 없고, 그 자리에는 다시 심을 수 있습니다. 목표를 채울 때까지 걸린 시간을 재며, 빠를수록 좋습니다.',
      THREE_SEEDS,
    ],
    unlocks: ['loop', 'expand1', 'cond', 'var', 'func', 'for', 'sunflower', 'list', 'speed2', 'strawberry', 'tulip', 'tomato'],
    goal: { item: 'Tomato', amount: 100 },
    metric: { kind: 'time' },
    limitMs: 200000, medals: { gold: 126350, silver: 160500, bronze: 194650 }, seeds: [1, 2, 3],
    minScore: 24000, // 칸 하나에서 많아야 4개꼴로 얻으므로 16칸 가운데 어느 칸은 두 번 길러야 한다. 시드마다 4초 × 2
    setup: seed => makeState(4, 4, seed, empty, { Tulip: 60 }),
  },
  {
    id: 'c08-crate-v1', no: 8, title: '상자 정렬', concept: '정렬',
    brief: [
      '3×3 선반에 다 자란 과일 상자 9개가 놓여 있고, 상자마다 무게가 다릅니다. 코인을 81개 모으면 성공입니다.',
      '오른쪽과 위쪽 이웃이 더 무겁거나 같고, 왼쪽과 아래쪽 이웃이 더 가볍거나 같게 정렬된 상자 무리를 수확하면 무리 크기의 제곱만큼 코인을 얻습니다. 정렬되지 않은 상자를 수확하면 그 상자만 사라지고 코인을 1개 얻습니다.',
      '이 과제에서는 작물을 심을 수 없습니다. 자리를 바꾼 횟수를 재며, 적을수록 좋습니다.',
      THREE_SEEDS,
    ],
    unlocks: ['loop', 'expand1', 'cond', 'var', 'func', 'for', 'sunflower', 'list', 'dict', 'crate'],
    goal: { item: 'Coin', amount: 81 },
    metric: { kind: 'count', event: 'swap' },
    limitMs: 90000, medals: { gold: 26, silver: 31, bronze: 35 }, seeds: [9, 10, 15],
    minScore: 19, // 세 배치를 전부 탐색하여 구한 가장 적은 횟수의 합(5 + 8 + 6). 균형 테스트가 다시 계산한다
    setup: seed => {
      const weights = crateWeights(seed)
      return makeState(3, 3, seed, i => grown('Crate', weights[i]))
    },
  },
]

export function challengeById(id: string): ChallengeDef | undefined {
  return CHALLENGES.find(c => c.id === id)
}

export function medalFor(def: ChallengeDef, score: number): Medal | null {
  if (score <= def.medals.gold) return 'gold'
  if (score <= def.medals.silver) return 'silver'
  if (score <= def.medals.bronze) return 'bronze'
  return null
}

export function formatScore(def: ChallengeDef, score: number): string {
  return def.metric.kind === 'time' ? `${(score / 1000).toFixed(2)}초` : `${score}번`
}

export function goalText(def: ChallengeDef): string {
  // 전력은 낱개로 세지 않는다.
  const unit = def.goal.item === 'Power' ? '' : '개'
  return `${ITEM_LABEL[def.goal.item]} ${def.goal.amount}${unit} 모으기`
}
