import { Game } from './game'
import type { ChallengeDef } from './challenges'
import type { WorldEvent } from '../sim/types'

export const STEP_MS = 50

export type RunStatus = 'ready' | 'running' | 'success' | 'failed'
export type FailReason = 'timeout' | 'error' | 'ended' | 'stopped'
export type ActionKind = 'move' | 'harvest' | 'plant' | 'water' | 'swap' | 'fail'
export interface RunStats { timeMs: number; actions: number; counts: Record<ActionKind, number> }

export const FAIL_TEXT: Record<FailReason, string> = {
  timeout: '제한 시간 안에 목표를 채우지 못했습니다.',
  error: '코드에 오류가 있어 실행이 멈췄습니다.',
  ended: '목표를 채우기 전에 프로그램이 끝났습니다.',
  stopped: '실행을 멈췄습니다.',
}

const newCounts = (): Record<ActionKind, number> => ({ move: 0, harvest: 0, plant: 0, water: 0, swap: 0, fail: 0 })

export class ChallengeRun {
  readonly def: ChallengeDef
  readonly seed: number
  readonly game: Game
  private st: RunStatus = 'ready'
  private why: FailReason | null = null
  private points: number | null = null
  private counts = newCounts()
  private pending: WorldEvent[] = []
  private carryMs = 0
  private usedStep = false

  constructor(def: ChallengeDef, seed: number, code: string) {
    this.def = def
    this.seed = seed
    this.game = Game.forChallenge(def.setup(seed), def.unlocks, code)
  }

  get status(): RunStatus { return this.st }
  get reason(): FailReason | null { return this.why }
  get score(): number | null { return this.points }
  // 한 단계 실행을 한 번이라도 썼다. 그런 실행의 결과는 누른 시점에 따라 달라지므로 기록으로 쓰지 않는다.
  get stepped(): boolean { return this.usedStep }

  get stats(): RunStats {
    const counts = { ...this.counts }
    const actions = Object.values(counts).reduce((a, b) => a + b, 0)
    return { timeMs: this.game.world.state.timeMs, actions, counts }
  }

  get progress(): number { return Math.floor(this.game.world.state.items[this.def.goal.item]) }

  start(): boolean {
    if (this.st !== 'ready') return this.st === 'running'
    if (!this.game.run()) {
      this.finish('failed', 'error')
      return false
    }
    this.st = 'running'
    return true
  }

  stepOnce(): void {
    if (this.st === 'ready' && !this.start()) return
    if (this.st !== 'running') return
    this.usedStep = true
    this.game.stepOnce()
    this.collect()
    this.judge(false)
  }

  resume(): void {
    if (this.st !== 'running' || !this.game.paused || !this.game.canResume) return
    this.game.run()
  }

  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return
    if (this.st !== 'running') return
    this.carryMs += ms
    while (this.st === 'running' && this.carryMs >= STEP_MS) {
      this.carryMs -= STEP_MS
      this.step()
    }
  }

  stop(): void {
    if (this.st === 'running') this.finish('failed', 'stopped')
  }

  takeEvents(): WorldEvent[] {
    const out = this.pending
    this.pending = []
    return out
  }

  private step(): void {
    const game = this.game
    game.tick(STEP_MS)
    this.collect()
    this.judge(true)
  }

  // 월드에 쌓인 이벤트를 세고 화면에 넘길 목록에 옮긴다. 시듦은 목록에는 넣지만 세지는 않는다.
  private collect(): void {
    for (const e of this.game.world.takeEvents()) {
      if (e.type !== 'wilt') this.counts[e.type]++
      this.pending.push(e)
    }
  }

  // 목표 도달과 프로그램의 끝을 판정한다. 한 단계 실행 직후에는 제한 시간을 보지 않는다.
  private judge(checkTime: boolean): void {
    const game = this.game
    if (this.progress >= this.def.goal.amount) {
      const m = this.def.metric
      this.points = m.kind === 'time' ? game.world.state.timeMs : this.counts[m.event]
      this.finish('success', null)
    } else if (game.status === 'error') this.finish('failed', 'error')
    else if (game.status === 'idle') this.finish('failed', 'ended')
    else if (checkTime && game.world.state.timeMs >= this.def.limitMs) this.finish('failed', 'timeout')
  }

  // 끝난 까닭을 기록하고 게임을 멈춘다. 이후의 advance는 아무 일도 하지 않는다.
  private finish(status: 'success' | 'failed', reason: FailReason | null): void {
    this.st = status
    this.why = reason
    if (this.game.status === 'running') this.game.stop() // 오류 상태는 화면이 보여 줄 수 있게 남긴다
  }
}
