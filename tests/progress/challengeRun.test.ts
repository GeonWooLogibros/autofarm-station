import { describe, expect, test } from 'vitest'
import { CHALLENGES } from '../../src/progress/challenges'
import { ChallengeRun, FAIL_TEXT, STEP_MS } from '../../src/progress/challengeRun'

const c1 = CHALLENGES[0]
const c2 = CHALLENGES[1]
const run = (def = c1, code = 'while True:\n    harvest()\n') => new ChallengeRun(def, def.seeds[0], code)
const finish = (r: ChallengeRun, frame = 250) => { r.start(); for (let i = 0; i < 100000 && r.status === 'running'; i++) r.advance(frame) }

describe('과제 실행기', () => {
  test('1번 과제 성공', () => {
    const r = run()
    finish(r)
    expect(r.status).toBe('success')
    expect(r.reason).toBeNull()
    expect(r.score).toBeGreaterThan(0)
    expect(r.score! % STEP_MS).toBe(0)
    expect(r.progress).toBeGreaterThanOrEqual(5)
  })

  test('같은 코드와 시드는 같은 결과', () => {
    const a = run(); finish(a)
    const b = run(); finish(b)
    expect(a.score).toBe(b.score)
    expect(a.stats).toEqual(b.stats)
  })

  test('프레임 시간과 무관하다', () => {
    const a = run(); finish(a, 16)
    const b = run(); finish(b, 250)
    expect(a.status).toBe('success')
    expect(a.score).toBe(b.score)
  })

  test('큰 값과 정수가 아닌 값으로도 같은 기록이 나온다', () => {
    const base = run(); finish(base)
    const big = run(); big.start(); big.advance(60000)
    expect(big.status).toBe('success')
    expect(big.score).toBe(base.score)
    const frac = run(); finish(frac, 16.6667)
    expect(frac.score).toBe(base.score)
  })

  test('ready에서 advance는 아무 일도 하지 않는다', () => {
    const r = run()
    r.advance(100)
    expect(r.status).toBe('ready')
    expect(r.stats.timeMs).toBe(0)
  })

  test('오류로 끝나도 게임의 오류 상태가 남는다', () => {
    const e = run(c1, 'harvest(1)\n'); finish(e)
    expect(e.game.status).toBe('error')
    expect(e.game.errorLine).toBeGreaterThan(0)
    const c = run(c1, 'harvest(\n')
    c.start()
    expect(c.game.status).toBe('error')
    expect(c.game.errorLine).toBeGreaterThan(0)
  })

  test('resume은 멈춘 프로그램을 처음부터 다시 시작하지 않는다', () => {
    const r = run(c1, 'while True:\n    harvest()\n    harvest()\n')
    r.start(); r.advance(500)
    const before = r.stats.actions
    r.resume() // 멈춘 것이 아니므로 아무 일도 하지 않는다
    expect(r.game.paused).toBe(false)
    expect(r.stats.actions).toBe(before)
  })

  test('한 줄 프로그램을 stepOnce하면 곧바로 ended로 판정된다', () => {
    const r = run(c1, 'harvest()\n')
    r.stepOnce()
    expect([r.status, r.reason]).toEqual(['failed', 'ended'])
    expect(r.stats.actions).toBe(1)
    expect(r.takeEvents()).toHaveLength(1)
    const t = r.stats.timeMs
    r.stepOnce(); r.resume(); r.advance(1000)
    expect([r.status, r.reason]).toEqual(['failed', 'ended'])
    expect(r.stats.timeMs).toBe(t)
  })

  test('stepOnce 중 오류는 곧바로 error로 판정된다', () => {
    const r = run(c1, 'harvest(1)\n')
    r.stepOnce()
    expect([r.status, r.reason]).toEqual(['failed', 'error'])
    expect(r.game.status).toBe('error')
  })

  test('실패 네 가지', () => {
    const t = run(c2, 'while True:\n    move(Right)\n'); finish(t)
    expect([t.status, t.reason]).toEqual(['failed', 'timeout'])
    const e = run(c1, 'harvest(1)\n'); finish(e)
    expect([e.status, e.reason]).toEqual(['failed', 'error'])
    const n = run(c1, 'harvest()\n'); finish(n)
    expect([n.status, n.reason]).toEqual(['failed', 'ended'])
    const s = run(c1, 'while True:\n    pass\n'); s.start(); s.advance(100); s.stop()
    expect([s.status, s.reason]).toEqual(['failed', 'stopped'])
    expect(s.score).toBeNull()
    for (const k of ['timeout', 'error', 'ended', 'stopped'] as const) expect(FAIL_TEXT[k]).toMatch(/\.$/)
  })

  test('컴파일 오류', () => {
    const r = run(c1, 'harvest(\n')
    expect(r.start()).toBe(false)
    expect([r.status, r.reason]).toEqual(['failed', 'error'])
  })

  test('끝난 뒤의 advance는 시간을 바꾸지 않는다', () => {
    const r = run(); finish(r)
    const t = r.stats.timeMs
    r.advance(5000)
    expect(r.stats.timeMs).toBe(t)
  })

  test('이벤트 수와 counts의 합', () => {
    const r = run(c1, 'harvest()\nharvest()\n'); finish(r)
    const ev = r.takeEvents()
    const sum = Object.values(r.stats.counts).reduce((a, b) => a + b, 0)
    expect(ev.filter(e => e.type !== 'wilt')).toHaveLength(sum)
    expect(r.stats.actions).toBe(sum)
    expect(r.stats.counts.fail).toBeGreaterThanOrEqual(1) // 덜 자란 데이지 수확
    expect(r.takeEvents()).toEqual([])
  })

  test('시듦 이벤트는 목록으로 넘기되 횟수에는 넣지 않는다', () => {
    const c7 = CHALLENGES[6]
    let found = false
    for (let seed = 1; seed <= 50 && !found; seed++) {
      const r = new ChallengeRun(c7, seed, 'while True:\n    plant(Tomato)\n')
      r.start()
      const events = []
      for (let i = 0; i < 400 && r.status === 'running'; i++) { r.advance(250); events.push(...r.takeEvents()) }
      const wilts = events.filter(e => e.type === 'wilt')
      if (wilts.length === 0) continue
      found = true
      expect(r.stats.actions).toBe(events.length - wilts.length)
      expect(Object.values(r.stats.counts).reduce((a, b) => a + b, 0)).toBe(r.stats.actions)
    }
    expect(found).toBe(true)
  })

  test('8번은 swap 성공 횟수를 센다', () => {
    const c8 = CHALLENGES[7]
    const r = run(c8, 'swap(Right)\nswap(Right)\n'); finish(r)
    expect(r.stats.counts.swap).toBe(2)
  })

  test('stepOnce와 resume', () => {
    const r = run(c1, 'harvest()\nharvest()\nharvest()\n')
    expect(r.status).toBe('ready')
    r.stepOnce()
    expect(r.status).toBe('running')
    r.advance(5000)
    expect(r.stats.timeMs).toBeGreaterThan(0)
    expect(r.stats.actions).toBeLessThanOrEqual(1)
    const before = r.stats.actions
    r.advance(5000)
    expect(r.stats.actions).toBe(before)
    r.resume()
    r.advance(5000)
    expect(r.stats.actions).toBeGreaterThan(before)
  })


  test('stepped는 한 단계 실행을 한 번이라도 썼는지 알려 준다', () => {
    const plain = run(); finish(plain)
    expect(plain.stepped).toBe(false)
    const r = run()
    expect(r.stepped).toBe(false)
    r.stepOnce()
    expect(r.stepped).toBe(true)
    r.resume(); r.advance(60000)
    expect(r.status).toBe('success')
    expect(r.stepped).toBe(true)
    // 컴파일 오류로 시작하지 못한 실행은 한 단계도 실행하지 않았다.
    const broken = run(c1, 'harvest(\n')
    broken.stepOnce()
    expect(broken.stepped).toBe(false)
  })
})
