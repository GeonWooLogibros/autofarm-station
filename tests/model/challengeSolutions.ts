// 과제의 기준 풀이. simple은 본편의 안내 예제 수준의 풀이이고, tuned는 그 과제의 요령을 쓴 풀이이다.
// 등급 기준과 제한 시간은 이 풀이들의 기록으로 정한다(tests/challengeBalance.test.ts가 확인한다).
// 각 풀이는 그 과제의 unlocks만으로 컴파일되어야 한다.
export interface Solution { simple: string; tuned: string }

const HARVEST_LOOP = `while True:
    harvest()`

const ROW_LOOP = `while True:
    harvest()
    move(Right)`

const TEND_LOOP = `while True:
    if can_harvest():
        harvest()
        plant(Strawberry)
    move(Right)`

// 세 칸에 먼저 심어 두고, 칸마다 다 자랄 때까지 그 자리에서 기다렸다가 수확한다. 실패하는 동작으로 시간을 쓰지 않는다.
const C3_TUNED = `plant(Strawberry)
move(Right)
plant(Strawberry)
move(Right)
plant(Strawberry)
move(Right)
while True:
    while not can_harvest():
        pass
    harvest()
    plant(Strawberry)
    move(Right)`

const C4_SIMPLE = `while True:
    for y in range(3):
        for x in range(3):
            harvest()
            move(Right)
        move(Up)`

// 줄의 끝에서 오른쪽 대신 위로 올라가면 수확 한 번에 이동 한 번만 쓴다.
const C4_TUNED = `while True:
    harvest()
    move(Right)
    harvest()
    move(Right)
    harvest()
    move(Up)`

const C5_SIMPLE = `while True:
    if can_harvest():
        harvest()
        plant(Strawberry)
        water()
    move(Right)`

// 물을 쓰지 않는 풀이 가운데 잘 다듬은 것. 금 기준을 통과하지 못해야 한다.
export const C5_NO_WATER = C3_TUNED

// 칸마다 물을 한 번씩만 주면 한 바퀴를 도는 동안 딸기가 다 자란다. 마지막 세 번의 수확 뒤에는 다시 심지 않는다.
const C5_TUNED = `plant(Strawberry)
water()
move(Right)
plant(Strawberry)
water()
move(Right)
plant(Strawberry)
water()
move(Right)
while True:
    while not can_harvest():
        pass
    harvest()
    if num_items(Strawberry) < 13:
        plant(Strawberry)
    move(Right)`

// 선반 끝이 반대편으로 이어지는 것을 이용해 가까운 쪽으로 돌아간다.
const GO = `def go(tx, ty):
    while get_pos_x() != tx:
        if (tx - get_pos_x()) % n * 2 <= n:
            move(Right)
        else:
            move(Left)
    while get_pos_y() != ty:
        if (ty - get_pos_y()) % n * 2 <= n:
            move(Up)
        else:
            move(Down)`

// 모든 칸을 지나가며 꽃잎 수를 재고, 가장 큰 것을 찾아가 수확하기를 되풀이한다.
const C6_SIMPLE = `n = get_world_size()
petals = []
for y in range(n):
    for x in range(n):
        petals.append(measure())
        move(Right)
    move(Up)
while True:
    best = max(petals)
    at = 0
    while petals[at] != best:
        at += 1
    tx = at % n
    ty = at // n
    while get_pos_x() < tx:
        move(Right)
    while get_pos_x() > tx:
        move(Left)
    while get_pos_y() < ty:
        move(Up)
    while get_pos_y() > ty:
        move(Down)
    harvest()
    petals[at] = 0`

// 먼저 한 송이를 수확해 전력을 얻어 속도를 올리고, 두 줄만 지나가며 위아래 이웃까지 잰다.
// 꽃잎 수가 같은 것들 가운데에서는 가까운 것부터 수확한다.
const C6_TUNED = `n = get_world_size()
petals = []
for i in range(n * n):
    petals.append(0)

def look():
    at = get_pos_y() * n + get_pos_x()
    petals[at] = measure()
    petals[at + n] = measure(Up)
    petals[at - n] = measure(Down)

def sweep(dir):
    look()
    for i in range(n - 1):
        move(dir)
        look()

def dist(a, b):
    d = abs(a - b)
    return min(d, n - d)

${GO}

harvest()
move(Up)
sweep(Right)
move(Down)
move(Down)
move(Down)
sweep(Left)
petals[0] = 0

while True:
    best = max(petals)
    tier = []
    for i in range(n * n):
        if petals[i] == best:
            tier.append(i)
    while len(tier) > 0:
        x = get_pos_x()
        y = get_pos_y()
        near = 0
        nd = 99
        for k in range(len(tier)):
            d = dist(tier[k] % n, x) + dist(tier[k] // n, y)
            if d < nd:
                nd = d
                near = k
        at = tier.pop(near)
        go(at % n, at // n)
        harvest()
        petals[at] = 0`

const C7_SIMPLE = `n = get_world_size()
while True:
    ripe = 0
    for y in range(n):
        for x in range(n):
            if get_plant_type() == Tomato:
                if can_harvest():
                    ripe += 1
                else:
                    plant(Tomato)
            else:
                if can_harvest():
                    harvest()
                plant(Tomato)
            move(Right)
        move(Up)
    if ripe == n * n:
        harvest()`

// 이동 한 번에 한 칸씩 심고, 심은 순서대로 아직 익지 않은 칸만 다시 찾아간다.
// 자라는 중인지 시들었는지는 plant()가 성공하는지로 알아낸다.
const C7_TUNED = `n = get_world_size()

${GO}

while True:
    queue = []
    for y in range(n):
        for x in range(n):
            plant(Tomato)
            queue.append(get_pos_y() * n + get_pos_x())
            if x < n - 1:
                move(Right)
        move(Up)
    while len(queue) > 0:
        at = queue.pop(0)
        go(at % n, at // n)
        while not can_harvest():
            if plant(Tomato):
                queue.append(at)
                break
    harvest()`

// 줄마다 무게순으로 정리하고 다시 칸마다 정리한다.
const C8_SIMPLE = `n = get_world_size()
for y in range(n):
    for i in range(n - 1):
        for x in range(n - 1):
            if measure() > measure(Right):
                swap(Right)
            move(Right)
        move(Right)
    move(Up)
for x in range(n):
    for i in range(n - 1):
        for y in range(n - 1):
            if measure() > measure(Up):
                swap(Up)
            move(Up)
        move(Up)
    move(Right)
harvest()`

// 무게를 리스트에 옮겨 적고, 이웃끼리 순서가 어긋난 쌍 가운데 무게 차이가 가장 큰 쌍부터 바꾼다.
const C8_TUNED = `n = get_world_size()
w = []
for y in range(n):
    for x in range(n):
        w.append(measure())
        move(Right)
    move(Up)

${GO}

while True:
    best = 0
    for i in range(n * n):
        if i % n < n - 1 and w[i] - w[i + 1] > best:
            best = w[i] - w[i + 1]
            at = i
            other = i + 1
            dir = Right
        if i // n < n - 1 and w[i] - w[i + n] > best:
            best = w[i] - w[i + n]
            at = i
            other = i + n
            dir = Up
    if best == 0:
        break
    go(at % n, at // n)
    swap(dir)
    t = w[at]
    w[at] = w[other]
    w[other] = t
harvest()`

export const SOLUTIONS: Record<string, Solution> = {
  'c01-first-v1': { simple: HARVEST_LOOP, tuned: HARVEST_LOOP },
  'c02-row-v1': { simple: ROW_LOOP, tuned: ROW_LOOP },
  'c03-ripe-v1': { simple: TEND_LOOP, tuned: C3_TUNED },
  'c04-grid-v1': { simple: C4_SIMPLE, tuned: C4_TUNED },
  'c05-water-v1': { simple: C5_SIMPLE, tuned: C5_TUNED },
  'c06-sunflower-v1': { simple: C6_SIMPLE, tuned: C6_TUNED },
  'c07-tomato-v1': { simple: C7_SIMPLE, tuned: C7_TUNED },
  'c08-crate-v1': { simple: C8_SIMPLE, tuned: C8_TUNED },
}
