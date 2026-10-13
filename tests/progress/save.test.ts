import { describe, expect, test } from 'vitest'
import { Game } from '../../src/progress/game'
import { CORRUPT_KEY, SAVE_KEY, deserialize, loadGame, resetGame, saveGame, serialize, type StorageLike } from '../../src/progress/save'

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: k => { data.delete(k) } }
}
const played = () => {
  const g = Game.create(3)
  g.world.state.items.Daisy = 500
  g.buy('loop'); g.buy('expand1')
  g.code = 'while True:\n    harvest()\n    move(Right)'
  g.settings.guide = false
  g.seenGuides.add('loop')
  g.run()
  for (let i = 0; i < 100; i++) g.tick(50)
  return g
}

describe('저장과 불러오기', () => {
  test('저장했다가 불러오면 코드, 자원, 해금, 선반, 설정, 플레이 시간이 같다', () => {
    const g = played()
    const r = deserialize(serialize(g))!
    expect(r.code).toBe(g.code)
    expect(r.world.state).toEqual(g.world.state)
    expect([...r.unlocked]).toEqual([...g.unlocked])
    expect(r.settings).toEqual(g.settings)
    expect([...r.seenGuides]).toEqual(['loop'])
    expect(r.playMs).toBe(g.playMs)
    expect(r.finishedAtMs).toBeNull()
  })

  test('불러온 게임은 프로그램이 정지된 상태이고, 다시 실행할 수 있다', () => {
    const r = deserialize(serialize(played()))!
    expect(r.status).toBe('idle')
    expect(r.run()).toBe(true)
  })

  test('불러온 뒤에도 난수가 이어진다', () => {
    const a = played()
    const b = deserialize(serialize(a))!
    a.world.advance(5000); b.world.advance(5000)
    expect(b.world.state).toEqual(a.world.state)
  })

  test.each([
    ['빈 문자열', ''],
    ['JSON이 아님', '{{{'],
    ['버전이 다름', JSON.stringify({ version: 99 })],
    ['필드가 빠짐', JSON.stringify({ version: 1, code: 'x' })],
    ['칸 수가 크기와 맞지 않음', (() => { const o = JSON.parse(serialize(Game.create(1))); o.world.w = 3; return JSON.stringify(o) })()],
    ['알 수 없는 해금 id', (() => { const o = JSON.parse(serialize(Game.create(1))); o.unlocked = ['nope']; return JSON.stringify(o) })()],
    ['자원이 숫자가 아님', (() => { const o = JSON.parse(serialize(Game.create(1))); o.world.items.Daisy = 'many'; return JSON.stringify(o) })()],
  ])('읽을 수 없는 데이터(%s)는 null을 돌려준다', (_name, json) => {
    expect(deserialize(json)).toBeNull()
  })
})

describe('저장소', () => {
  test('저장된 데이터가 없으면 새 게임으로 시작한다', () => {
    const g = loadGame(memory(), 1)
    expect(g.unlocked.size).toBe(0)
  })

  test('저장하고 다시 불러온다', () => {
    const s = memory()
    expect(saveGame(s, played())).toBe(true)
    expect(loadGame(s, 1).unlocked.has('expand1')).toBe(true)
  })

  test('깨진 데이터는 별도 키로 옮기고 새 게임으로 시작한다', () => {
    const s = memory()
    s.setItem(SAVE_KEY, '{{{')
    const g = loadGame(s, 1)
    expect(g.unlocked.size).toBe(0)
    expect(s.getItem(CORRUPT_KEY)).toBe('{{{')
  })

  test('저장소가 예외를 던져도 게임은 계속된다', () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error('차단됨') },
      setItem: () => { throw new Error('용량 초과') },
      removeItem: () => { throw new Error('차단됨') },
    }
    expect(loadGame(broken, 1).unlocked.size).toBe(0)
    expect(saveGame(broken, Game.create(1))).toBe(false)
    expect(() => resetGame(broken)).not.toThrow()
  })

  test('초기화는 이 게임의 키만 지운다', () => {
    const s = memory()
    s.setItem('other-game:save', 'keep')
    s.setItem(CORRUPT_KEY, 'x')
    saveGame(s, played())
    resetGame(s)
    expect(s.getItem(SAVE_KEY)).toBeNull()
    expect(s.getItem(CORRUPT_KEY)).toBeNull()
    expect(s.getItem('other-game:save')).toBe('keep')
  })
})
