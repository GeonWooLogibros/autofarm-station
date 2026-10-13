import {
  BASE_YIELD, GROW_MS, PLANT_COST, POWER_ACTIONS_PER_UNIT, SUNFLOWER_BONUS, SUNFLOWER_MIN_COUNT,
  WATER_FILL_MS, WATER_GROWTH_BONUS, WATER_PER_USE, WILT_CHANCE,
} from '../sim/balance'
import { UNLOCK_ORDER, unlockDef, type UnlockId } from './unlocks'

export interface GuideEntry {
  id: UnlockId | 'start'
  title: string
  body: string[] // 합니다체 문장
  example: string // 예제 코드. 그 항목과 선행 항목이 여는 문법과 함수만 사용한다. 없으면 빈 문자열
  goal: string // 스스로 해 볼 목표 한 문장
}

export interface FunctionDoc { name: string; signature: string; desc: string; unlock: UnlockId | null }

// 안내 문장의 숫자는 실제 규칙과 어긋나지 않도록 규칙을 정한 값에서 가져온다.
const seconds = (ms: number): number => ms / 1000
const BASE_ACTION_SECONDS = 0.5 // 동작 하나는 200틱이고 드론은 1초에 400틱을 처리한다
const actionSeconds = (id: UnlockId): string => {
  const s = BASE_ACTION_SECONDS / (unlockDef(id).speed ?? 1)
  return Number.isInteger(s * 100) ? `${s}초` : `약 ${s.toFixed(2)}초`
}
const side = (id: UnlockId): number => unlockDef(id).size?.w ?? 1
const cube = (n: number): number => n ** 3

const SWEEP_STRAWBERRY = `while True:
    x = 0
    while x < get_world_size():
        if can_harvest():
            harvest()
            plant(Strawberry)
        move(Right)
        x += 1
    move(Up)`

const EXAMPLES: Partial<Record<UnlockId | 'start', string>> = {
  start: 'harvest()',
  loop: `while True:
    harvest()`,
  expand1: `while True:
    harvest()
    move(Right)`,
  cond: `while True:
    if can_harvest():
        harvest()
    move(Right)`,
  strawberry: `while True:
    if can_harvest():
        harvest()
        plant(Strawberry)
    move(Right)`,
  expand2: `while True:
    if can_harvest():
        harvest()
        plant(Strawberry)
    move(Right)
    if can_harvest():
        harvest()
        plant(Strawberry)
    move(Right)
    if can_harvest():
        harvest()
        plant(Strawberry)
    move(Right)
    move(Up)`,
  watering: `while True:
    if can_harvest():
        harvest()
        plant(Strawberry)
        water()
    move(Right)`,
  var: `# x는 지금 줄에서 지나온 칸의 수입니다.
${SWEEP_STRAWBERRY}`,
  func: `# count는 지금까지 수확한 횟수입니다. print(count)로 확인할 수 있습니다.
count = 0

def tend():
    # 함수 바깥에서 만든 count의 값을 바꾸므로 global이 필요합니다.
    global count
    if can_harvest():
        harvest()
        plant(Strawberry)
        count += 1

while True:
    x = 0
    while x < get_world_size():
        tend()
        move(Right)
        x += 1
    move(Up)`,
  // 튤립은 변수만 해금하면 살 수 있으므로 함수(def)를 쓰지 않는다.
  tulip: `while True:
    x = 0
    while x < get_world_size():
        if can_harvest():
            harvest()
            # 가로 위치와 세로 위치를 더한 값이 짝수인 칸에만 심습니다.
            if (get_pos_x() + get_pos_y()) % 2 == 0:
                plant(Tulip)
        move(Right)
        x += 1
    move(Up)`,
  for: `n = get_world_size()
while True:
    for y in range(n):
        for x in range(n):
            if can_harvest():
                harvest()
                if (get_pos_x() + get_pos_y()) % 2 == 0:
                    plant(Tulip)
            move(Right)
        move(Up)`,
  // 해바라기는 for 반복만 해금하면 살 수 있으므로 함수와 리스트를 쓰지 않는다.
  sunflower: `n = get_world_size()
while True:
    # 처음 돌 때에는 해바라기를 심고, 다 자란 해바라기의 꽃잎 수 가운데 가장 큰 값을 찾습니다.
    best = 0
    for y in range(n):
        for x in range(n):
            if get_plant_type() == Sunflower:
                if can_harvest() and measure() > best:
                    best = measure()
            elif can_harvest():
                harvest()
                plant(Sunflower)
            move(Right)
        move(Up)
    # 다시 돌면서 꽃잎 수가 그 값과 같은 해바라기를 수확하고 새로 심습니다.
    for y in range(n):
        for x in range(n):
            if get_plant_type() == Sunflower and can_harvest():
                if measure() == best:
                    harvest()
                    plant(Sunflower)
            move(Right)
        move(Up)`,
  list: `# 한 줄을 지나가면서 해바라기의 꽃잎 수를 리스트에 담습니다.
petals = []
for x in range(get_world_size()):
    if get_plant_type() == Sunflower:
        petals.append(measure())
    move(Right)
print(petals)
if len(petals) > 0:
    print(max(petals))`,
  tomato: `n = get_world_size()
while True:
    ripe = 0
    for y in range(n):
        for x in range(n):
            if get_plant_type() == Tomato:
                if can_harvest():
                    ripe += 1
                else:
                    # 시든 토마토는 새로 심은 토마토로 바뀝니다.
                    plant(Tomato)
            else:
                if can_harvest():
                    harvest()
                plant(Tomato)
            move(Right)
        move(Up)
    if ripe == n * n:
        harvest()`,
  dict: `# 칸마다 다 자랐는지를 위치와 함께 기록합니다.
n = get_world_size()
ready = {}
for y in range(n):
    for x in range(n):
        ready[(get_pos_x(), get_pos_y())] = can_harvest()
        move(Right)
    move(Up)
# 다 자란 칸의 위치만 출력합니다.
for pos in ready:
    if ready[pos]:
        print(pos)`,
  crate: `n = get_world_size()
while get_pos_x() > 0:
    move(Left)
# 한 줄에 상자를 놓습니다.
for x in range(n):
    if get_plant_type() != Crate:
        # 다 자란 작물만 수확합니다. 자라는 중인 작물을 수확하면 작물만 사라지기 때문입니다.
        if can_harvest():
            harvest()
        plant(Crate)
    move(Right)
# 무거운 상자를 오른쪽으로 한 칸씩 보냅니다.
for x in range(n - 1):
    if get_plant_type() == Crate and measure(Right) != None:
        if measure() > measure(Right):
            swap(Right)
    move(Right)`,
}

type GuideText = Pick<GuideEntry, 'body' | 'goal'>

const yieldGuide = (name: string, unit: string, base: number): GuideText => ({
  body: [
    `${name}를 수확할 때마다 얻는 양이 2배가 됩니다.`,
    `이제 다 자란 ${name}를 한 번 수확하면 ${name} ${base * 2}${unit}를 얻습니다.`,
  ],
  goal: `${name}의 수가 전보다 빨리 늘어나는지 확인해 보세요.`,
})

const TEXTS: Record<UnlockId | 'start', GuideText> = {
  start: {
    body: [
      '이 온실의 드론은 코드로만 움직입니다.',
      'harvest()는 드론이 있는 화분의 작물을 수확하는 명령입니다.',
      '실행하기를 누르면 코드가 위에서부터 한 줄씩 실행됩니다.',
      `수확한 화분에는 데이지가 저절로 다시 피고, ${seconds(GROW_MS.Daisy)}초가 지나면 다 자랍니다.`,
    ],
    goal: `실행하기를 여러 번 눌러 데이지 ${unlockDef('loop').cost.Daisy}송이를 모아 보세요.`,
  },
  loop: {
    body: [
      'while True: 아래에 들여 쓴 줄은 끝없이 반복해서 실행됩니다.',
      '들여쓰기는 스페이스 4칸으로 맞춥니다.',
      '반복을 멈추려면 정지하기를 누르세요.',
    ],
    goal: '실행하기를 한 번만 눌러 데이지가 계속 쌓이게 해 보세요.',
  },
  speed1: {
    body: [
      `드론이 ${unlockDef('speed1').speed}배 빠르게 움직입니다.`,
      `수확이나 이동 같은 동작 하나에 걸리는 시간이 ${BASE_ACTION_SECONDS}초에서 ${actionSeconds('speed1')}로 줄어듭니다.`,
    ],
    goal: '코드를 실행하여 드론이 얼마나 빨라졌는지 확인해 보세요.',
  },
  expand1: {
    body: [
      `선반이 가로 ${side('expand1')}칸으로 넓어졌습니다.`,
      'move(Right)는 드론을 오른쪽으로 한 칸 옮깁니다.',
      '선반의 오른쪽 끝에서 move(Right)를 실행하면 드론은 왼쪽 끝 칸으로 넘어갑니다.',
      'Right 대신 Left를 넣으면 드론이 왼쪽으로 움직입니다.',
    ],
    goal: '세 화분을 모두 돌면서 수확해 보세요.',
  },
  cond: {
    body: [
      'if 조건: 아래에 들여 쓴 줄은 조건이 참일 때에만 실행됩니다.',
      '드론이 동작하는 줄은 진하게 켜져 있고, 곧바로 지나가는 while과 if 줄은 청록색 흔적으로 잠깐 남습니다.',
      'can_harvest()는 드론이 있는 화분의 작물이 다 자랐으면 참을, 아직 자라는 중이면 거짓을 알려 줍니다.',
      '수확에 실패해도 동작 시간은 그대로 걸리므로, 다 자란 화분에서만 수확하면 시간을 아낄 수 있습니다.',
      'get_plant_type()은 드론이 있는 화분에 어떤 작물이 있는지 알려 줍니다.',
    ],
    goal: '다 자란 화분에서만 수확하게 해 보세요.',
  },
  strawberry: {
    body: [
      `plant(Strawberry)는 드론이 있는 화분에 딸기를 심으며, 심을 때마다 바닥의 화물칸에 모아 둔 데이지 ${PLANT_COST.Strawberry.Daisy}송이를 값으로 냅니다.`,
      `딸기는 ${seconds(GROW_MS.Strawberry)}초가 지나면 다 자라고, 수확하면 딸기 ${BASE_YIELD.Strawberry}개를 얻습니다.`,
      '다 자라지 않은 딸기를 수확하면 딸기는 얻지 못하고 작물만 사라지므로, can_harvest()로 먼저 확인해야 합니다.',
      '딸기는 비어 있는 화분이나 데이지가 있는 화분에만 심을 수 있습니다.',
      '데이지가 모자라면 plant()는 딸기를 심지 못하고 False를 돌려주며, 비어 있는 화분에는 데이지가 저절로 핍니다.',
    ],
    goal: `딸기 ${unlockDef('expand2').cost.Strawberry}개를 모아 보세요.`,
  },
  expand2: {
    body: [
      `선반이 가로 ${side('expand2')}칸, 세로 ${side('expand2')}칸으로 넓어졌습니다.`,
      'move(Up)은 드론을 윗줄로 한 칸 옮기고, 맨 윗줄에서는 맨 아랫줄로 넘어갑니다.',
      '한 줄을 다 돈 다음에 move(Up)을 실행하면 모든 화분을 차례로 지나갈 수 있습니다.',
    ],
    goal: '아홉 화분을 모두 돌면서 딸기를 길러 보세요.',
  },
  watering: {
    body: [
      `water()는 물탱크의 물 1을 써서 드론이 있는 화분의 수분을 ${WATER_PER_USE}만큼 올립니다.`,
      `수분은 0에서 1 사이의 값이고, 수분이 1인 화분의 작물은 ${1 + WATER_GROWTH_BONUS}배 빨리 자랍니다.`,
      '화분의 수분은 시간이 지나면 조금씩 줄어들며, get_water()로 지금의 수분을 확인할 수 있습니다.',
      `물탱크는 비어 있는 채로 시작하며, ${seconds(WATER_FILL_MS)}초마다 물 1이 채워지고 최대 ${unlockDef('watering').waterCap}까지 저장됩니다.`,
      '물탱크가 가득 차면 더 채워지지 않으므로, 물은 아껴 두기보다 꾸준히 쓰는 편이 좋습니다.',
      '물탱크가 비어 있으면 water()는 물을 주지 못하고 False를 돌려주며, 동작 시간만 씁니다.',
    ],
    goal: '물을 준 화분과 주지 않은 화분에서 딸기가 자라는 속도를 비교해 보세요.',
  },
  var: {
    body: [
      'x = 3이라고 쓰면 3이라는 값에 x라는 이름을 붙여 저장합니다.',
      '이렇게 이름을 붙여 저장한 값을 변수라고 합니다.',
      'x += 1은 x에 1을 더한 값을 다시 x에 저장합니다.',
      'get_world_size()는 선반 한 줄의 칸 수를 알려 주고, num_items(Daisy)는 가지고 있는 데이지의 수를 알려 줍니다.',
      'get_pos_x()와 get_pos_y()는 드론의 가로 위치와 세로 위치를 알려 주며, 왼쪽 아래 칸이 (0, 0)입니다.',
    ],
    goal: '데이지가 20송이보다 적을 때에는 딸기를 심지 않게 해 보세요.',
  },
  func: {
    body: [
      'def 이름(): 아래에 들여 쓴 코드는 그 이름을 가진 함수가 됩니다.',
      '함수는 이름()이라고 써서 필요할 때마다 실행할 수 있습니다.',
      '함수 안에서 return 값이라고 쓰면 함수가 그 값을 돌려주고 끝납니다.',
      '함수 안에서 변수에 값을 넣으면 그 함수 안에서만 쓰는 새 변수가 만들어지고, 함수 바깥의 변수는 바뀌지 않습니다.',
      '함수 바깥에서 만든 변수의 값을 함수 안에서 바꾸려면, 함수 안에 global 변수이름이라고 먼저 적어야 합니다.',
    ],
    goal: '한 줄을 도는 코드를 함수로 만들어 보세요.',
  },
  tulip: {
    body: [
      `plant(Tulip)은 튤립을 심고 데이지 ${PLANT_COST.Tulip.Daisy}송이를 씁니다.`,
      `튤립은 ${seconds(GROW_MS.Tulip)}초가 지나면 다 자라고, 한 번 수확하면 튤립 ${BASE_YIELD.Tulip}송이를 얻습니다.`,
      '상하좌우로 이웃한 화분에 튤립이 하나 있을 때마다 튤립이 자라는 시간이 2배로 늘어납니다.',
      '%는 나눗셈의 나머지를 구하는 연산자입니다.',
      '가로 위치와 세로 위치를 더한 값을 2로 나눈 나머지가 0인 칸에만 심으면 튤립이 서로 이웃하지 않습니다.',
    ],
    goal: '튤립이 서로 이웃하지 않게 한 칸씩 건너서 심어 보세요.',
  },
  for: {
    body: [
      'for i in range(3): 아래에 들여 쓴 줄은 3번 반복해서 실행됩니다.',
      '반복할 때마다 i에는 0, 1, 2가 차례로 저장됩니다.',
      'range(1, 4)라고 쓰면 i에 1, 2, 3이 차례로 저장됩니다.',
    ],
    goal: 'while로 쓴 코드를 for로 바꿔 보세요.',
  },
  expand3: {
    body: [
      `선반이 가로 ${side('expand3')}칸, 세로 ${side('expand3')}칸으로 넓어졌습니다.`,
      'get_world_size()로 칸 수를 구하는 코드는 고치지 않아도 넓어진 선반의 모든 칸을 지나갑니다.',
      `코드에 ${side('expand2')}이라는 숫자를 직접 적었다면 get_world_size()로 바꿔야 합니다.`,
      '실행 중인 코드가 있으면 정지한 다음 다시 실행해 주세요.',
    ],
    goal: `코드에 ${side('expand2')}이라는 숫자가 남아 있는지 확인해 보세요.`,
  },
  speed2: {
    body: [
      `드론이 처음보다 ${unlockDef('speed2').speed}배 빠르게 움직입니다.`,
      `동작 하나에 걸리는 시간이 ${actionSeconds('speed2')}로 줄어듭니다.`,
    ],
    goal: '드론이 선반을 한 바퀴 도는 데 걸리는 시간을 확인해 보세요.',
  },
  sunflower: {
    body: [
      `plant(Sunflower)는 해바라기를 심고 딸기 ${PLANT_COST.Sunflower.Strawberry}개를 씁니다.`,
      `해바라기는 ${seconds(GROW_MS.Sunflower)}초가 지나면 다 자라고, 수확하면 전력 1을 얻습니다.`,
      `전력을 가지고 있는 동안에는 드론이 2배 빠르게 움직이고, 동작을 ${POWER_ACTIONS_PER_UNIT}번 할 때마다 전력이 1씩 줄어듭니다.`,
      '해바라기의 꽃잎 수는 심을 때 7장에서 15장 사이로 정해지며, measure()는 드론이 있는 화분의 꽃잎 수를 알려 줍니다.',
      `다 자란 해바라기가 선반에 ${SUNFLOWER_MIN_COUNT}송이 이상 있을 때 그중에서 꽃잎이 가장 많은 해바라기를 수확하면 전력 ${SUNFLOWER_BONUS}을 얻습니다.`,
      '예제는 선반을 두 번 돕니다. 처음에는 다 자란 해바라기의 꽃잎 수 가운데 가장 큰 값을 찾고, 다시 돌면서 꽃잎 수가 그 값과 같은 해바라기를 수확한 뒤 새로 심습니다.',
    ],
    goal: '꽃잎이 많은 해바라기부터 차례로 수확해 보세요.',
  },
  list: {
    body: [
      '리스트는 여러 값을 순서대로 담아 두는 묶음이고, [ ] 안에 값을 적어서 만듭니다.',
      '리스트 이름 뒤에 .append(값)을 붙이면 맨 뒤에 값을 넣습니다.',
      '리스트 이름 뒤에 [번호]를 붙이면 그 순서에 있는 값을 꺼내며, 번호는 0부터 시작합니다.',
      'len()은 리스트에 담긴 값의 개수를 알려 주고, max()와 min()은 가장 큰 값과 가장 작은 값을 알려 줍니다.',
    ],
    goal: '선반에 있는 모든 해바라기의 꽃잎 수를 리스트에 담고 가장 큰 값을 찾아 보세요.',
  },
  tomato: {
    body: [
      `plant(Tomato)는 토마토를 심고 튤립 ${PLANT_COST.Tomato.Tulip}송이를 씁니다.`,
      `토마토는 ${seconds(GROW_MS.Tomato)}초가 지나면 다 자라는데, 다 자라는 순간에 ${WILT_CHANCE * 100}% 확률로 시듭니다.`,
      '시든 토마토는 수확할 수 없고, 그 화분에 plant()를 다시 실행하면 새로 심은 작물로 바뀝니다.',
      '익은 토마토를 수확하면, 그 칸을 포함하면서 익은 토마토로만 채워진 가장 큰 정사각형을 한꺼번에 수확합니다.',
      `정사각형의 한 변이 n칸이면 토마토 n × n × n개를 얻으므로, ${side('expand3')}×${side('expand3')}칸을 한 번에 수확하면 ${cube(side('expand3'))}개를 얻습니다.`,
    ],
    goal: `${side('expand3')}×${side('expand3')}칸을 모두 익혀 토마토 ${cube(side('expand3'))}개를 한 번에 수확해 보세요.`,
  },
  expand4: {
    body: [
      `선반이 가로 ${side('expand4')}칸, 세로 ${side('expand4')}칸으로 넓어졌습니다.`,
      `${side('expand4')}×${side('expand4')}칸을 모두 익은 토마토로 채우고 수확하면 토마토 ${cube(side('expand4'))}개를 한 번에 얻습니다.`,
      '실행 중인 코드가 있으면 정지한 다음 다시 실행해 주세요.',
    ],
    goal: `${side('expand4')}×${side('expand4')}칸을 모두 익은 토마토로 채워 보세요.`,
  },
  dict: {
    body: [
      '딕셔너리는 이름표와 값을 짝지어 저장하며, 이 이름표를 키라고 합니다.',
      'd = {}라고 쓰면 비어 있는 딕셔너리를 만듭니다.',
      'd[키] = 값이라고 쓰면 값을 저장하고, d[키]라고 쓰면 저장한 값을 꺼냅니다.',
      '(x, y)처럼 위치를 키로 쓰면 칸마다 값을 하나씩 기록할 수 있습니다.',
      'for 키 in d: 아래에 들여 쓴 줄은 저장된 키마다 한 번씩 실행됩니다.',
    ],
    goal: '칸마다 상태를 기록하고, 다시 확인해야 하는 칸만 찾아가 보세요.',
  },
  crate: {
    body: [
      `plant(Crate)는 과일 상자를 놓고 토마토 ${PLANT_COST.Crate.Tomato}개를 씁니다.`,
      '상자의 무게는 놓을 때 0에서 9 사이로 정해집니다.',
      'measure()는 드론이 있는 칸의 상자 무게를 알려 주고, measure(Right)처럼 방향을 넣으면 이웃한 칸의 상자 무게를 알려 줍니다.',
      '상자가 없는 칸이나 선반 바깥을 재면 None을 알려 줍니다.',
      'swap(Right)는 드론이 있는 칸과 오른쪽 칸에 놓인 것을 서로 바꿉니다.',
      '오른쪽과 위쪽에 이웃한 상자가 자기보다 무겁거나 같고, 왼쪽과 아래쪽에 이웃한 상자가 자기보다 가볍거나 같으면 정리된 상자입니다.',
      '정리된 상자를 수확하면 상하좌우로 이어진 정리된 상자를 모두 출하하고, 출하한 상자 수를 제곱한 만큼 코인을 얻습니다.',
      '정리되지 않은 상자를 수확하면 그 상자 하나만 출하하고 코인 1을 얻습니다.',
    ],
    goal: '한 줄의 상자를 왼쪽부터 가벼운 순서로 정리한 다음 수확해 보세요.',
  },
  yieldDaisy: yieldGuide('데이지', '송이', BASE_YIELD.Daisy),
  yieldStrawberry: yieldGuide('딸기', '개', BASE_YIELD.Strawberry),
  yieldTulip: {
    body: [
      '튤립을 수확할 때마다 얻는 양이 2배가 됩니다.',
      `이제 다 자란 튤립을 한 번 수확하면 튤립 ${BASE_YIELD.Tulip * 2}송이를 얻습니다.`,
    ],
    goal: '튤립의 수가 전보다 빨리 늘어나는지 확인해 보세요.',
  },
  automation: {
    body: [
      '온실이 완전히 자동화되었습니다.',
      '시작부터 지금까지 걸린 시간은 엔딩 화면에서 확인할 수 있습니다.',
      '엔딩을 본 뒤에도 계속 플레이할 수 있습니다.',
    ],
    goal: '처음부터 다시 시작하여 더 짧은 시간 안에 온실을 자동화해 보세요.',
  },
}

const START_TITLE = '온실에 오신 것을 환영합니다'

export const GUIDES: GuideEntry[] = (['start', ...UNLOCK_ORDER] as (UnlockId | 'start')[]).map(id => ({
  id,
  title: id === 'start' ? START_TITLE : unlockDef(id).title,
  body: TEXTS[id].body,
  example: EXAMPLES[id] ?? '',
  goal: TEXTS[id].goal,
}))

const BY_ID = new Map<UnlockId | 'start', GuideEntry>(GUIDES.map(g => [g.id, g]))

export function guideFor(id: UnlockId | 'start'): GuideEntry {
  const g = BY_ID.get(id)
  if (!g) throw new Error(`알 수 없는 안내 항목입니다: ${id}`)
  return g
}

// 설명서의 함수 목록. 드론 함수 14개와 내장 함수 5개이다.
export const FUNCTION_DOCS: FunctionDoc[] = [
  { name: 'harvest', signature: 'harvest()', desc: '드론이 있는 칸의 작물을 수확합니다. 수확했으면 True를 돌려줍니다.', unlock: null },
  { name: 'print', signature: 'print(값)', desc: '출력 영역에 값을 표시합니다.', unlock: null },
  { name: 'move', signature: 'move(방향)', desc: '드론이 Right, Left, Up, Down 가운데 한 방향으로 한 칸 이동합니다. 선반 끝을 넘어가면 반대편 칸으로 넘어갑니다.', unlock: 'expand1' },
  { name: 'can_harvest', signature: 'can_harvest()', desc: '드론이 있는 칸의 작물이 다 자랐으면 True를, 아니면 False를 돌려줍니다.', unlock: 'cond' },
  { name: 'get_plant_type', signature: 'get_plant_type()', desc: '드론이 있는 칸에 있는 작물의 이름을 돌려줍니다. 칸이 비어 있으면 None을 돌려줍니다.', unlock: 'cond' },
  { name: 'plant', signature: 'plant(작물)', desc: '드론이 있는 칸에 작물을 심습니다. 비용이 모자라거나 칸에 데이지가 아닌 작물이 있으면 심지 못하고 False를 돌려줍니다.', unlock: 'strawberry' },
  { name: 'water', signature: 'water()', desc: `물탱크의 물 1을 써서 드론이 있는 칸의 수분을 ${WATER_PER_USE}만큼 올립니다. 물이 없으면 False를 돌려줍니다.`, unlock: 'watering' },
  { name: 'get_water', signature: 'get_water()', desc: '드론이 있는 칸의 수분을 0에서 1 사이의 값으로 돌려줍니다.', unlock: 'watering' },
  { name: 'get_pos_x', signature: 'get_pos_x()', desc: '드론의 가로 위치를 돌려줍니다. 맨 왼쪽 칸이 0입니다.', unlock: 'var' },
  { name: 'get_pos_y', signature: 'get_pos_y()', desc: '드론의 세로 위치를 돌려줍니다. 맨 아래 칸이 0입니다.', unlock: 'var' },
  { name: 'get_world_size', signature: 'get_world_size()', desc: '선반 한 줄의 칸 수를 돌려줍니다.', unlock: 'var' },
  { name: 'num_items', signature: 'num_items(자원)', desc: '가지고 있는 자원의 수를 돌려줍니다. 예를 들어 num_items(Daisy)는 데이지의 수를 돌려줍니다.', unlock: 'var' },
  { name: 'abs', signature: 'abs(숫자)', desc: '숫자에서 부호를 뗀 값을 돌려줍니다. 예를 들어 abs(-3)은 3입니다.', unlock: 'var' },
  { name: 'range', signature: 'range(끝) / range(시작, 끝) / range(시작, 끝, 간격)', desc: '시작부터 끝 바로 앞까지의 정수를 차례로 만듭니다. 시작을 적지 않으면 0부터 시작합니다.', unlock: 'for' },
  { name: 'measure', signature: 'measure() / measure(방향)', desc: '해바라기의 꽃잎 수나 과일 상자의 무게를 돌려줍니다. 방향을 넣으면 이웃한 칸을 잽니다.', unlock: 'sunflower' },
  { name: 'len', signature: 'len(리스트)', desc: '리스트, 튜플, 딕셔너리에 담긴 값의 개수를 돌려줍니다.', unlock: 'list' },
  { name: 'min', signature: 'min(리스트)', desc: '리스트에 담긴 숫자 가운데 가장 작은 값을 돌려줍니다. min(3, 5)처럼 숫자를 여러 개 넣을 수도 있습니다.', unlock: 'list' },
  { name: 'max', signature: 'max(리스트)', desc: '리스트에 담긴 숫자 가운데 가장 큰 값을 돌려줍니다. max(3, 5)처럼 숫자를 여러 개 넣을 수도 있습니다.', unlock: 'list' },
  { name: 'swap', signature: 'swap(방향)', desc: '드론이 있는 칸과 이웃한 칸에 놓인 것을 서로 바꿉니다. 선반 바깥쪽으로는 바꾸지 못하고 False를 돌려줍니다.', unlock: 'crate' },
]
