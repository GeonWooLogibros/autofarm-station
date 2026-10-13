import { compile, type LockedText, type Program, type StepResult } from '../lang'
import { World } from '../sim/world'
import type { WorldState } from '../sim/types'
import { buildDroneApi } from './droneApi'
import {
  canBuy, featureTitles, speedMultiplier, unlockDef, unlockedFeatures, type UnlockId,
} from './unlocks'

export interface Settings { guide: boolean; sound: boolean }
export interface OutputLine { kind: 'print' | 'error' | 'info'; text: string }
export type RunStatus = 'idle' | 'running' | 'error'

// 과제에서는 해금 화면이 없으므로 해금을 권하는 말 대신 쓸 수 없다는 사실만 알린다.
const CHALLENGE_LOCKED_TEXT: LockedText = (kind, label) =>
  kind === 'syntax' ? `이 과제에서는 쓸 수 없는 문법입니다: ${label}.`
  : kind === 'name' ? `이 과제에서는 쓸 수 없는 함수입니다: ${label}.`
  : `이 과제에서는 심을 수 없는 작물입니다: ${label}.`

export const MAX_RECENT_LINES = 32
export const BASE_TICKS_PER_SECOND = 400
export const MAX_FRAME_MS = 250
export const MAX_OUTPUT_LINES = 200
export const MAX_OUTPUT_CHARS = 2000 // 출력 한 줄의 길이
const SLICE_MS = 50

export class Game {
  world: World
  unlocked = new Set<UnlockId>()
  code = 'harvest()\n'
  playMs = 0
  challenge = false // 과제용 게임이면 true. 해금을 살 수 없고 잠금 문구가 다르다
  finishedAtMs: number | null = null // 엔딩을 본 시점의 playMs
  settings: Settings = { guide: true, sound: true }
  seenGuides = new Set<UnlockId>()
  output: OutputLine[] = []
  status: RunStatus = 'idle'
  currentLine = 0 // 실행 중이 아니면 0
  errorLine = 0 // 오류가 없으면 0
  // 마지막 오류가 플레이어의 코드가 아니라 게임 내부의 문제였다면 그 원인. 화면 쪽에서 개발자 콘솔에 남긴다.
  errorCause: unknown = undefined

  // 이번 tick() 동안 실행을 시작한 줄을 시작한 순서대로 둔다(이어서 같은 줄이면 한 번만, 최근 MAX_RECENT_LINES개까지).
  // 즉시 끝나는 while과 if 같은 줄도 편집기에 보이게 하려는 것이다. 실행 중이 아니면 비어 있다.
  private recent: number[] = []
  get recentLines(): readonly number[] { return this.recent }

  private program: Program | null = null
  private programSource = '' // program을 만든 코드
  private pausedFlag = false
  // 드론이 이미 한 동작을 끝내는 데 남은 틱. 프로그램이 끝나거나 멈추거나 바뀌어도 남으며, 저장하지 않는다.
  private busyTicks = 0

  private constructor(world: World) {
    this.world = world
  }

  static create(seed: number): Game {
    return new Game(World.create(seed))
  }

  // 주어진 상태와 해금 집합으로 과제용 게임을 만든다. 상태는 복사해서 쓴다.
  static forChallenge(state: WorldState, unlocked: readonly UnlockId[], code: string): Game {
    const game = Game.create(0)
    game.world = new World(structuredClone(state))
    game.unlocked = new Set(unlocked)
    game.code = code
    game.challenge = true
    return game
  }

  // stepOnce로 멈춰 있는 상태
  get paused(): boolean { return this.pausedFlag }

  // 드론이 앞서 한 동작을 아직 끝내지 못한 상태. 이 동안에는 어떤 문장도 새로 실행되지 않는다.
  get busy(): boolean { return this.busyTicks > 0 || (this.program !== null && this.program.debt > 0) }

  // 프로그램을 내려놓는다. 치르지 않은 동작 시간은 드론에게 남긴다.
  private dropProgram(): void {
    if (this.program) this.busyTicks += this.program.takeDebt()
    this.program = null
  }

  // 멈춘 프로그램을 이어서 실행할 수 있는 상태. 멈춘 동안 코드를 고쳤다면 이어서 실행하지 않고 고친 코드로 새로 시작한다.
  get canResume(): boolean {
    return this.program !== null && this.pausedFlag && this.code === this.programSource
  }

  run(): boolean {
    if (this.canResume) {
      this.pausedFlag = false
      return true
    }
    this.dropProgram()
    this.errorLine = 0
    this.errorCause = undefined
    const lockedText = this.challenge ? CHALLENGE_LOCKED_TEXT : undefined
    const api = buildDroneApi(this.world, this.unlocked, text => this.pushOutput('print', text), lockedText)
    const result = compile(this.code, {
      features: unlockedFeatures(this.unlocked),
      featureTitles: featureTitles(),
      globals: api.globals,
      lockedNames: api.lockedNames,
      lockedText,
    })
    if (!result.ok) {
      this.pausedFlag = false
      this.currentLine = 0
      this.status = 'error'
      this.errorLine = result.error.line
      this.pushOutput('error', `${result.error.line}번째 줄: ${result.error.message}`)
      return false
    }
    this.program = result.program
    this.program.onLine = line => this.noteLine(line)
    this.programSource = this.code
    this.pausedFlag = false
    this.status = 'running'
    this.currentLine = 0
    return true
  }

  stop(): void {
    this.dropProgram()
    this.recent.length = 0
    this.status = 'idle'
    this.currentLine = 0
    this.pausedFlag = false
  }

  // 프로그램을 멈춘 상태로 두고 문장 하나를 실행한다. 드론이 앞선 동작을 끝내지 못했으면 멈추기만 하고
  // 문장은 실행하지 않는다(나중에 실행되도록 쌓아 두지도 않는다).
  stepOnce(): void {
    if (this.pausedFlag && !this.canResume) this.dropProgram() // 멈춘 동안 코드를 고쳤다
    this.recent.length = 0
    if (!this.program && !this.run()) return
    if (!this.program) return
    this.pausedFlag = true
    this.busyTicks += this.program.takeDebt()
    if (this.busyTicks > 0) return
    this.applyResult(this.program.stepStatement())
    // 끝났거나 오류가 났다면 applyResult가 이미 넘겨받았다.
    if (this.program) this.busyTicks += this.program.takeDebt()
  }

  tick(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return
    this.recent.length = 0
    let remaining = Math.min(dtMs, MAX_FRAME_MS)
    while (remaining > 0) {
      const slice = Math.min(SLICE_MS, remaining)
      remaining -= slice
      this.world.advance(slice)
      this.playMs += slice
      // 남은 동작 시간을 먼저 치르고, 남는 예산이 있을 때에만 프로그램을 진행한다.
      let budget = slice * this.ticksPerSecond() / 1000
      const paid = Math.min(this.busyTicks, budget)
      this.busyTicks -= paid
      budget -= paid
      if (this.program && !this.pausedFlag && budget > 0) this.applyResult(this.program.step(budget))
    }
  }

  ticksPerSecond(): number {
    return BASE_TICKS_PER_SECOND * speedMultiplier(this.unlocked) * (this.world.state.items.Power > 0 ? 2 : 1)
  }

  canBuy(id: UnlockId): boolean {
    return canBuy(this.unlocked, this.world.state.items, id)
  }

  buy(id: UnlockId): boolean {
    if (this.challenge || !this.canBuy(id)) return false
    const def = unlockDef(id)
    const items = this.world.state.items
    for (const k of Object.keys(def.cost) as (keyof typeof def.cost)[]) items[k] -= def.cost[k] ?? 0
    this.unlocked.add(id)
    // 선반은 넓어지기만 한다. 더 큰 선반을 이미 가진 상태에서 작은 확장을 사도 줄이지 않는다.
    if (def.size) {
      const { w, h } = this.world.state
      this.world.resize(Math.max(w, def.size.w), Math.max(h, def.size.h))
    }
    if (def.waterCap !== undefined) this.world.state.waterCap = def.waterCap
    if (def.yieldMult) this.world.state.yieldMult[def.yieldMult] = 2
    if (id === 'automation') this.finishedAtMs = this.playMs
    return true
  }

  private noteLine(line: number): void {
    const r = this.recent
    if (r[r.length - 1] === line) return
    r.push(line)
    if (r.length > MAX_RECENT_LINES) r.shift()
  }

  private applyResult(r: StepResult): void {
    if (r.status === 'running') {
      this.currentLine = r.line
    } else if (r.status === 'done') {
      this.stop()
    } else {
      this.pushOutput('error', `${r.line}번째 줄: ${r.error?.message ?? '알 수 없는 오류입니다.'}`)
      this.stop()
      this.status = 'error'
      this.errorLine = r.line
      this.errorCause = r.error?.cause
    }
  }

  private pushOutput(kind: OutputLine['kind'], text: string): void {
    this.output.push({ kind, text: text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}…` : text })
    if (this.output.length > MAX_OUTPUT_LINES) this.output.splice(0, this.output.length - MAX_OUTPUT_LINES)
  }
}
