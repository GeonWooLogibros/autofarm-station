import type { UnlockId } from '../../src/progress/unlocks'

// 모범 플레이어의 코드. from 항목을 해금한 시점부터 다음 단계의 from 직전까지 이 코드를 실행한다.
// 각 코드는 그 시점까지 해금한 문법과 함수만 사용한다(균형 테스트가 실제 잠금 검사를 거쳐 실행한다).
export interface ModelStage { from: UnlockId | 'start'; code: string }

// 모범 플레이어가 해금 항목을 구입하는 순서. 수확량 강화는 그 작물을 주로 기르는 시기에 구입한다.
export const BUY_ORDER: UnlockId[] = [
  'loop', 'speed1', 'expand1', 'cond', 'yieldDaisy', 'strawberry', 'expand2', 'watering', 'var', 'func',
  'yieldStrawberry', 'tulip', 'for', 'yieldTulip', 'expand3', 'speed2', 'sunflower', 'list', 'tomato',
  'expand4', 'dict', 'crate', 'automation',
]

// 변수를 해금하기 전에는 칸마다 같은 코드를 되풀이해서 적어야 한다.
const TEND = `if can_harvest():
        harvest()
        plant(Strawberry)`

// 함수 값을 치르려면 데이지를 모아야 하므로, 데이지가 넉넉할 때에만 딸기를 심는다.
const VAR_CODE = `while True:
    x = 0
    while x < get_world_size():
        if can_harvest():
            harvest()
        if num_items(Daisy) > 120:
            plant(Strawberry)
        move(Right)
        x += 1
    move(Up)`

const FUNC_CODE = `def tend():
    if can_harvest():
        harvest()
    plant(Strawberry)

while True:
    x = 0
    while x < get_world_size():
        tend()
        move(Right)
        x += 1
    move(Up)`

// 튤립은 이웃에 튤립이 없도록 엇갈려 심고, 나머지 칸에는 딸기를 심는다. 데이지가 모자라면 심지 않고 데이지가 피게 둔다.
const TULIP_CODE = `def tend():
    if can_harvest():
        harvest()
    if num_items(Daisy) < 40:
        return 0
    if (get_pos_x() + get_pos_y()) % 2 == 0:
        plant(Tulip)
    else:
        plant(Strawberry)

while True:
    x = 0
    while x < get_world_size():
        tend()
        move(Right)
        x += 1
    move(Up)`

// 리스트가 없으므로 꽃잎 수 15부터 7까지 차례로 선반을 돌면서 수확한다.
// 모두 다 자란 뒤에 수확을 시작해야 가장 큰 꽃이 뒤늦게 익어 8배를 놓치는 일이 없다.
const SUNFLOWER_CODE = `n = get_world_size()

def sweep(kind):
    ripe = 0
    for y in range(n):
        for x in range(n):
            if can_harvest():
                ripe += 1
                if get_plant_type() != Sunflower:
                    harvest()
            plant(kind)
            move(Right)
        move(Up)
    return ripe

def harvest_petals(petals):
    for y in range(n):
        for x in range(n):
            if get_plant_type() == Sunflower and measure() >= petals:
                harvest()
            move(Right)
        move(Up)

while True:
    while num_items(Strawberry) < n * n:
        sweep(Strawberry)
    while sweep(Sunflower) < n * n:
        pass
    for p in range(15, 6, -1):
        harvest_petals(p)`

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

// 전력이 떨어지면 해바라기를 한 번 길러 채우고, 그 밖에는 튤립과 딸기를 기른다.
// 꽃잎 수를 리스트에 담아 가장 큰 것부터 찾아가서 수확한다.
const LIST_CODE = `n = get_world_size()

${GO}

def power():
    ripe = 0
    while ripe < n * n:
        ripe = 0
        for y in range(n):
            for x in range(n):
                go(x, y)
                if get_plant_type() == Sunflower:
                    if can_harvest():
                        ripe += 1
                else:
                    if can_harvest():
                        harvest()
                    plant(Sunflower)
    petals = []
    for y in range(n):
        for x in range(n):
            go(x, y)
            petals.append(measure())
    for i in range(len(petals)):
        best = max(petals)
        at = 0
        while petals[at] != best:
            at += 1
        go(at % n, at // n)
        harvest()
        petals[at] = 0

def crops():
    for y in range(n):
        for x in range(n):
            go(x, y)
            if can_harvest():
                harvest()
            if (x + y) % 2 == 0:
                plant(Tulip)
            elif num_items(Strawberry) < n * n:
                plant(Strawberry)

while True:
    if num_items(Power) < 5 and num_items(Strawberry) >= n * n:
        power()
    crops()`

const STOCK = `def stock():
    for y in range(n):
        for x in range(n):
            go(x, y)
            if can_harvest():
                harvest()
            if (x + y) % 2 == 0:
                plant(Tulip)`

// 선반 전체가 익을 때까지 돌면서 시든 자리에 다시 심고, 모두 익으면 한 번에 수확한다.
const TOMATO_CODE = `n = get_world_size()

${GO}

${STOCK}

def tomatoes():
    while True:
        ripe = 0
        for y in range(n):
            for x in range(n):
                go(x, y)
                if get_plant_type() != Tomato:
                    if can_harvest():
                        harvest()
                plant(Tomato)
                if get_plant_type() == Tomato and can_harvest():
                    ripe += 1
        if ripe == n * n:
            harvest()
            return 0

while True:
    while num_items(Tulip) < n * n * 3:
        stock()
    tomatoes()`

// 칸마다 익었는지를 딕셔너리에 적어 두고, 아직 익지 않은 칸만 다시 찾아간다.
const TOMATOES_WITH_DICT = `def tomatoes():
    ripe = {}
    for y in range(n):
        for x in range(n):
            ripe[(x, y)] = False
    left = n * n
    while left > 0:
        left = 0
        for pos in ripe:
            if not ripe[pos]:
                go(pos[0], pos[1])
                if get_plant_type() == Tomato and can_harvest():
                    ripe[pos] = True
                else:
                    left += 1
                    if get_plant_type() != Tomato and can_harvest():
                        harvest()
                    plant(Tomato)
    harvest()`

const DICT_CODE = `n = get_world_size()

${GO}

${STOCK}

${TOMATOES_WITH_DICT}

while True:
    while num_items(Tulip) < n * n * 2:
        stock()
    tomatoes()`

// 상자로 선반을 가득 채운 뒤, 줄마다 무게순으로 정리하고 다시 칸마다 정리하면 전체가 정리된다.
const CRATE_CODE = `n = get_world_size()

${GO}

${STOCK}

${TOMATOES_WITH_DICT}

def crates():
    filled = 0
    while filled < n * n:
        filled = 0
        for y in range(n):
            for x in range(n):
                go(x, y)
                if get_plant_type() != Crate:
                    harvest()
                    plant(Crate)
                if get_plant_type() == Crate:
                    filled += 1
    go(0, 0)
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
    harvest()

while True:
    while num_items(Tomato) < n * n * 2:
        while num_items(Tulip) < n * n * 2:
            stock()
        tomatoes()
    crates()`

export const MODEL: ModelStage[] = [
  { from: 'start', code: 'harvest()' },
  { from: 'loop', code: 'while True:\n    harvest()' },
  { from: 'expand1', code: 'while True:\n    harvest()\n    move(Right)' },
  { from: 'cond', code: 'while True:\n    if can_harvest():\n        harvest()\n    move(Right)' },
  { from: 'strawberry', code: `while True:\n    ${TEND}\n    move(Right)` },
  { from: 'expand2', code: `while True:\n    ${TEND}\n    move(Right)\n    ${TEND}\n    move(Right)\n    ${TEND}\n    move(Right)\n    move(Up)` },
  { from: 'var', code: VAR_CODE },
  { from: 'func', code: FUNC_CODE },
  { from: 'tulip', code: TULIP_CODE },
  { from: 'sunflower', code: SUNFLOWER_CODE },
  { from: 'list', code: LIST_CODE },
  { from: 'tomato', code: TOMATO_CODE },
  { from: 'dict', code: DICT_CODE },
  { from: 'crate', code: CRATE_CODE },
]
