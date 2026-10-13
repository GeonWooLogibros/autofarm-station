import { describe, expect, test } from 'vitest'
import { GUIDES, FUNCTION_DOCS, guideFor } from '../../src/progress/guide'
import { UNLOCKS, UNLOCK_ORDER, featureTitles, unlockDef, unlockedFeatures, type UnlockId } from '../../src/progress/unlocks'
import { buildDroneApi } from '../../src/progress/droneApi'
import { Game } from '../../src/progress/game'
import { World } from '../../src/sim/world'
import { ITEM_KINDS } from '../../src/sim/types'
import { compile } from '../../src/lang'

// 그 항목을 살 수 있는 가장 이른 상태: 항목 자신과, 선행 항목을 거슬러 올라가며 만나는 모든 항목.
// 목록의 순서(UNLOCK_ORDER)대로 샀다고 가정하면 실제로는 아직 없을 수 있는 문법을 예제가 쓰게 된다.
function unlockedAt(id: UnlockId | 'start'): UnlockId[] {
  const seen = new Set<UnlockId>()
  const visit = (u: UnlockId): void => {
    if (seen.has(u)) return
    seen.add(u)
    unlockDef(u).requires.forEach(visit)
  }
  if (id !== 'start') visit(id)
  return UNLOCK_ORDER.filter(u => seen.has(u)) // 선행 항목이 항상 앞에 오는 순서
}

// 안내를 보는 시점의 게임 상태를 만든다. 자원을 넉넉히 주고 해금한 뒤, 남길 자원의 양을 정한다.
function gameAt(id: UnlockId | 'start', itemsEach: number): Game {
  const g = Game.create(7)
  for (const u of unlockedAt(id)) {
    for (const k of ITEM_KINDS) g.world.state.items[k] = 100000
    expect(g.buy(u), u).toBe(true)
  }
  for (const k of ITEM_KINDS) g.world.state.items[k] = itemsEach
  return g
}

describe('안내', () => {
  test('시작 안내와 모든 해금 항목의 안내가 있다', () => {
    expect(GUIDES.map(g => g.id)).toEqual(['start', ...UNLOCK_ORDER])
  })

  test('제목은 해금 항목의 이름과 같다', () => {
    expect(guideFor('start').title).toBe('온실에 오신 것을 환영합니다')
    for (const id of UNLOCK_ORDER) expect(guideFor(id).title).toBe(unlockDef(id).title)
    expect(guideFor('loop').title).toBe('반복')
  })

  test('문장은 합니다체이고 목표가 있다', () => {
    for (const g of GUIDES) {
      expect(g.body.length, g.id).toBeGreaterThanOrEqual(2)
      for (const s of g.body) expect(s, g.id).toMatch(/(니다|세요)\.$/)
      expect(g.goal, g.id).toMatch(/(니다|세요)\.$/)
    }
  })

  test('문장에 줄표와 마크다운 기호를 쓰지 않는다', () => {
    for (const g of GUIDES) {
      for (const s of [g.title, ...g.body, g.goal]) expect(s, g.id).not.toMatch(/[—–`]/)
    }
    for (const f of FUNCTION_DOCS) expect(f.desc, f.name).not.toMatch(/[—–`]/)
  })

  test('예제 코드는 그 항목까지만 해금한 상태에서 잠금 오류 없이 컴파일된다', () => {
    for (const g of GUIDES) {
      if (!g.example) continue
      const unlocked = new Set<UnlockId>(unlockedAt(g.id))
      const api = buildDroneApi(World.create(1), unlocked, () => {})
      const r = compile(g.example, { features: unlockedFeatures(unlocked), featureTitles: featureTitles(), globals: api.globals, lockedNames: api.lockedNames })
      expect(r.ok, `${g.id}: ${r.ok ? '' : r.error.message}`).toBe(true)
    }
  })

  test('선행 항목만 해금한 상태는 목록 순서대로 해금한 상태보다 좁다', () => {
    expect(unlockedAt('start')).toEqual([])
    expect(unlockedAt('tulip')).toEqual(['loop', 'expand1', 'cond', 'strawberry', 'var', 'tulip'])
    expect(unlockedAt('tulip')).not.toContain('func')
    expect(unlockedAt('sunflower')).not.toContain('func')
    expect(unlockedAt('expand4')).toEqual(expect.arrayContaining(['expand2', 'expand3']))
  })

  test('새 문법이나 함수를 여는 항목에는 예제가 있고, 예제는 그 문법이나 함수를 사용한다', () => {
    for (const u of UNLOCKS) {
      const opens = u.features.length + u.names.length + u.plants.length > 0
      if (!opens) continue
      const example = guideFor(u.id).example
      expect(example, u.id).not.toBe('')
      const before = new Set<UnlockId>(unlockedAt(u.id).filter(x => x !== u.id))
      const api = buildDroneApi(World.create(1), before, () => {})
      const r = compile(example, { features: unlockedFeatures(before), featureTitles: featureTitles(), globals: api.globals, lockedNames: api.lockedNames })
      const usesPlant = u.plants.some(p => example.includes(`plant(${p})`))
      expect(!r.ok || usesPlant, `${u.id}: 예제가 새로 해금한 것을 사용하지 않는다`).toBe(true)
    }
  })

  // 자원이 넉넉할 때와 하나도 없을 때 모두 2분 동안 실행 오류가 없어야 한다.
  test.each([1000, 0])('예제 코드는 자원이 %i개씩 있을 때 실행 오류 없이 돌아간다', itemsEach => {
    for (const guide of GUIDES) {
      if (!guide.example) continue
      const g = gameAt(guide.id, itemsEach)
      g.code = guide.example
      expect(g.run(), guide.id).toBe(true)
      for (let ms = 0; ms < 120000; ms += 250) {
        g.tick(250)
        if (g.status === 'idle') g.run() // 끝나는 예제는 다시 실행한다
        expect(g.status, `${guide.id}: ${g.output.at(-1)?.text ?? ''}`).not.toBe('error')
      }
    }
  })

  test('자원이 넉넉하면 예제 코드는 2분 안에 눈에 보이는 일을 한다', () => {
    for (const guide of GUIDES) {
      if (!guide.example) continue
      const g = gameAt(guide.id, 1000)
      g.code = guide.example
      g.run()
      const events = new Set<string>()
      for (let ms = 0; ms < 120000; ms += 250) {
        g.tick(250)
        if (g.status === 'idle') g.run()
        for (const e of g.world.takeEvents()) events.add(e.type)
      }
      const visible = events.has('harvest') || events.has('plant') || events.has('swap') || g.output.some(o => o.kind === 'print')
      expect(visible, guide.id).toBe(true)
    }
  }, 30_000) // 예제를 모두 2분씩 실행하므로 기계에 부하가 있으면 기본 제한 5초를 넘는다

  // 예전 예제는 꽃잎이 15장인 해바라기만 수확하고 나머지를 그대로 두어, 선반이 15장 미만으로 가득 차면 전력이 더 들어오지 않았다.
  test.each([
    ['선행 항목만 해금한 선반', [] as UnlockId[]],
    ['4×4 선반', ['expand2', 'expand3'] as UnlockId[]],
  ])('해바라기 예제는 10분 동안 전력을 계속 얻는다(%s)', (_name, extra) => {
    const g = gameAt('sunflower', 100000)
    for (const id of extra) expect(g.buy(id), id).toBe(true)
    for (const k of ITEM_KINDS) g.world.state.items[k] = 100000
    g.world.state.items.Power = 0
    g.code = guideFor('sunflower').example
    expect(g.run()).toBe(true)
    const gained = [0, 0, 0, 0] // 2분 30초 구간마다 수확으로 얻은 전력
    for (let ms = 0; ms < 600000; ms += 250) {
      g.tick(250)
      expect(g.status, g.output.at(-1)?.text).toBe('running')
      for (const e of g.world.takeEvents()) {
        if (e.type === 'harvest' && e.item === 'Power') gained[Math.floor(ms / 150000)] += e.amount
      }
    }
    expect(gained[0], gained.join(', ')).toBeGreaterThan(0)
    expect(gained[2], gained.join(', ')).toBeGreaterThanOrEqual(10)
    expect(gained[3], gained.join(', ')).toBeGreaterThanOrEqual(10)
  })

  test('과일 상자 예제는 자라는 중인 토마토를 뽑지 않는다', () => {
    const g = gameAt('crate', 1000)
    g.world.state.items.Power = 0
    for (const c of g.world.state.cells) Object.assign(c, { plant: 'Tomato', growth: 0.01, wilted: false, value: 0 })
    g.code = guideFor('crate').example
    expect(g.run()).toBe(true)
    // 상자를 놓으며 한 줄을 지나가는 데 걸리는 시간(칸마다 동작 둘, 동작 하나에 0.5초)보다 조금 짧게 진행한다.
    const ms = g.world.state.w * 2 * 500 - 100
    for (let t = 0; t < ms; t += 50) g.tick(50)
    expect(g.status).toBe('running')
    expect(g.world.takeEvents().filter(e => e.type === 'move')).toHaveLength(g.world.state.w) // 모든 칸을 지나갔다
    expect(g.world.state.cells.map(c => c.plant)).toEqual(g.world.state.cells.map(() => 'Tomato'))
    expect(g.world.state.cells.every(c => c.growth > 0.5)).toBe(true)
  })

  test('함수 안내는 global을 설명하고 예제에서 사용한다', () => {
    const f = guideFor('func')
    expect(f.body.some(s => s.includes('global'))).toBe(true)
    expect(f.example).toContain('global count')
  })

  test('함수 설명에는 모든 드론 함수와 내장 함수가 있고, 여는 해금 항목이 실제와 같다', () => {
    const names = FUNCTION_DOCS.map(f => f.name)
    expect([...names].sort()).toEqual(['harvest', 'print', 'move', 'can_harvest', 'get_plant_type', 'plant', 'water', 'get_water', 'get_pos_x', 'get_pos_y', 'get_world_size', 'num_items', 'measure', 'swap', 'range', 'len', 'min', 'max', 'abs'].sort())
    for (const f of FUNCTION_DOCS) {
      const owner = UNLOCKS.find(u => u.names.includes(f.name))
      expect(f.unlock, f.name).toBe(owner ? owner.id : null)
      expect(f.signature.startsWith(`${f.name}(`), f.name).toBe(true)
      expect(f.desc, f.name).toMatch(/니다\.$/)
    }
  })
})
