import { describe, expect, test } from 'vitest'
import { World } from '../../src/sim/world'
import { buildDroneApi } from '../../src/progress/droneApi'
import { UNLOCK_ORDER, featureTitles, unlockedFeatures, type UnlockId } from '../../src/progress/unlocks'
import { compile } from '../../src/lang'

const setup = (unlocked: UnlockId[], size = 3) => {
  const world = World.create(1)
  world.resize(size, size)
  const out: string[] = []
  const set = new Set(unlocked)
  const api = buildDroneApi(world, set, t => out.push(t))
  const exec = (src: string, ticks = 100000) => {
    const r = compile(src, { features: unlockedFeatures(set), featureTitles: featureTitles(), globals: api.globals, lockedNames: api.lockedNames })
    if (!r.ok) return { status: 'error' as const, error: r.error }
    return r.program.step(ticks)
  }
  return { world, out, exec, api }
}
const ALL = UNLOCK_ORDER

describe('드론 함수', () => {
  test('처음에는 harvest와 print만 사용할 수 있다', () => {
    const { exec, world } = setup([], 1)
    expect(exec('harvest()').status).toBe('done')
    expect(world.state.items.Daisy).toBe(1)
    const r = exec('move(Right)')
    expect(r.status).toBe('error')
    expect(r.error!.kind).toBe('locked')
    expect(r.error!.message).toContain("'선반 확장 1'")
  })

  test('동작 함수는 200틱, 감지 함수는 1틱을 쓴다', () => {
    const { api } = setup(ALL)
    const ticks = (name: string) => (api.globals.get(name) as { ticks: number }).ticks
    for (const n of ['move', 'harvest', 'plant', 'water', 'swap']) expect(ticks(n), n).toBe(200)
    for (const n of ['can_harvest', 'get_plant_type', 'get_water', 'measure', 'get_pos_x', 'get_pos_y', 'get_world_size', 'num_items', 'print']) expect(ticks(n), n).toBe(1)
  })

  test('이동, 위치, 선반 크기', () => {
    const { exec, out } = setup(ALL)
    exec('move(Right)\nmove(Up)\nprint(get_pos_x())\nprint(get_pos_y())\nprint(get_world_size())')
    expect(out).toEqual(['1', '1', '3'])
  })

  test('심기, 작물 확인, 자원 수', () => {
    const { exec, out } = setup(ALL)
    exec('harvest()\nprint(num_items(Daisy))\nprint(plant(Strawberry))\nprint(get_plant_type() == Strawberry)\nprint(can_harvest())\nmove(Up)\nmove(Up)\nprint(get_plant_type())')
    expect(out).toEqual(['1', 'True', 'True', 'False', 'None'])
  })

  test('해금하지 않은 작물을 심으면 실행 중 오류이다', () => {
    const { exec } = setup(['loop', 'expand1', 'cond', 'strawberry'])
    const r = exec('plant(Tulip)')
    expect(r.status).toBe('error')
    expect(r.error!.kind).toBe('runtime')
    expect(r.error!.message).toContain('튤립')
  })

  test('해금하지 않은 작물의 오류는 필요한 해금 항목을 알려 준다', () => {
    const { exec } = setup(['loop', 'expand1', 'cond', 'strawberry'])
    expect(exec('plant(Tulip)').error!.message).toContain("'튤립' 항목을 해금")
    expect(exec('plant(Crate)').error!.message).toContain("'과일 상자' 항목을 해금")
  })

  test('방향이나 작물에 따옴표를 붙이면 따옴표를 빼라고 알려 준다', () => {
    const { exec } = setup(ALL)
    expect(exec('move("Right")').error!.message).toContain('따옴표')
    expect(exec('plant("Strawberry")').error!.message).toContain('따옴표')
    expect(exec('print(num_items("Daisy"))').error!.message).toContain('따옴표')
    expect(exec('move(3)').error!.message).not.toContain('따옴표')
  })

  test('잘못된 인자는 한국어로 안내한다', () => {
    const { exec } = setup(ALL)
    expect(exec('move(3)').error!.message).toContain('방향')
    expect(exec('plant(Right)').error!.message).toContain('작물')
    expect(exec('num_items(Up)').error!.message).toContain('자원')
  })

  test('measure와 swap', () => {
    const { exec, out, world } = setup(ALL)
    Object.assign(world.cellAt(0, 0), { plant: 'Crate', growth: 1, value: 8 })
    Object.assign(world.cellAt(1, 0), { plant: 'Crate', growth: 1, value: 3 })
    exec('print(measure())\nprint(measure(Right))\nif measure() > measure(Right):\n    swap(Right)\nprint(measure())')
    expect(out).toEqual(['8', '3', '3'])
  })

  test('print는 여러 종류의 값을 출력한다', () => {
    const { exec, out } = setup(ALL)
    exec('print("안녕")\nprint(Daisy)\nprint([1, Right])')
    expect(out).toEqual(['안녕', 'Daisy', '[1, Right]'])
  })

  test('for 반복을 해금해야 range를 쓸 수 있고, 리스트를 해금해야 len을 쓸 수 있다', () => {
    const before = setup(UNLOCK_ORDER.slice(0, UNLOCK_ORDER.indexOf('for')))
    expect(before.api.lockedNames.get('range')).toBe('for 반복')
    expect(before.api.lockedNames.get('len')).toBe('리스트')
    const after = setup(ALL)
    expect(after.api.globals.has('range')).toBe(true)
    expect(after.api.lockedNames.size).toBe(0)
  })
})

describe('드론 함수 추가 확인', () => {
  test('get_plant_type은 전역 상수와 같은 객체를 돌려준다', () => {
    const { world, api } = setup(ALL)
    world.state.items.Daisy = 10
    expect(world.plant('Tulip')).toBe(true)
    const fn = api.globals.get('get_plant_type') as { call: (a: never[]) => unknown }
    expect(fn.call([])).toBe(api.globals.get('Tulip'))
  })

  test('num_items(Water), water()와 get_water()', () => {
    const { exec, out, world } = setup(ALL)
    world.state.items.Water = 7.9
    exec('print(num_items(Water))\nharvest()\nprint(get_water())\nwater()\nprint(get_water())')
    expect(out[0]).toBe('7')
    expect(Number(out[2])).toBeGreaterThanOrEqual(Number(out[1]))
  })

  test('잠긴 작물은 심을 수 없고 해금한 작물은 심을 수 있다', () => {
    const cases: [string, UnlockId[], string][] = [
      ['Strawberry', ['strawberry'], '딸기'],
      ['Tulip', ['tulip'], '튤립'],
      ['Sunflower', ['sunflower'], '해바라기'],
      ['Tomato', ['tomato'], '토마토'],
      ['Crate', ['crate'], '과일 상자'],
    ]
    for (const [name, open, label] of cases) {
      const locked = setup(ALL.filter(id => !open.includes(id)))
      const r = locked.exec(`plant(${name})`)
      expect(r.status, name).toBe('error')
      // 딸기를 잠그면 plant 함수 자체가 잠기므로 문법 검사 단계의 오류가 된다.
      expect(r.error!.kind).toBe(name === 'Strawberry' ? 'locked' : 'runtime')
      if (name !== 'Strawberry') expect(r.error!.message).toContain(label)
      expect(setup(ALL).exec(`plant(${name})`).status, name).toBe('done')
    }
  })

  test('잘못된 값은 TypeError가 아니라 한국어 안내이다', () => {
    const { api } = setup(ALL)
    const call = (n: string, ...a: unknown[]) => (api.globals.get(n) as { call: (a: never[]) => unknown }).call(a as never[])
    for (const bad of [3, 'Right', null, { k: 'list', items: [] }, api.globals.get('Daisy')]) {
      expect(() => call('move', bad)).toThrow(/방향/)
    }
    for (const bad of [3, 'Daisy', null, api.globals.get('Right'), api.globals.get('Coin')]) {
      expect(() => call('plant', bad)).toThrow(/작물/)
    }
    for (const bad of [3, null, api.globals.get('Up')]) expect(() => call('num_items', bad)).toThrow(/자원/)
    for (const bad of [3, null, api.globals.get('Daisy')]) {
      expect(() => call('swap', bad)).toThrow(/방향/)
      expect(() => call('measure', bad)).toThrow(/방향/)
    }
    expect(() => call('move', null)).not.toThrow(TypeError)
  })
})
