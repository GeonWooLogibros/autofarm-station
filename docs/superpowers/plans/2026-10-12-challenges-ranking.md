# 확장 1단계(시작 화면, 도전 과제, 실행 기록, 랭킹) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「오토팜 스테이션」에 시작 화면, 도전 과제 8개, 실행 기록 표시, Firebase 랭킹을 추가한다.

**Architecture:** 과제는 "해금 항목의 집합 + 처음 온실 상태 + 목표"로 정의하고, 기존 `Game`을 그대로 감싼 `ChallengeRun`이 50ms 고정 단위로 진행하여 화면 실행과 화면 없는 실행이 같은 기록을 내게 한다. 화면은 `router`가 네 화면(시작, 본편, 과제 목록, 과제)을 전환하며, 편집기·실행 단추·기록 칸은 본편과 과제 화면이 함께 쓰는 `console` 모듈로 꺼낸다. 랭킹은 `RankingService` 인터페이스 뒤에 두어, 설정값이 없거나 서버에 닿지 않으면 빈 구현으로 동작한다.

**Tech Stack:** Vite 7, TypeScript 5.9, Vitest 3, CodeMirror 6, Firebase JS SDK(모듈형, `firebase/auth` + `firebase/firestore/lite`), `@firebase/rules-unit-testing`과 Firestore 에뮬레이터(규칙 테스트 전용).

**Spec:** `docs/superpowers/specs/2026-10-12-challenges-ranking-design.md` (본편 설계: `docs/superpowers/specs/2026-10-08-gardener-replaced-design.md`)

## Global Constraints

- 작업 브랜치는 `feat/game`이다. `main`에 병합하거나 원격에 올리지 않는다.
- 본편의 규칙과 수치(`src/sim/balance.ts`, `src/progress/unlocks.ts`의 값)를 바꾸지 않는다.
- 본편 저장 데이터의 형식과 키(`gardener-replaced:save:v1`, `gardener-replaced:save:corrupt`)를 바꾸지 않는다. 과제 데이터는 `gardener-replaced:challenges:v1` 키 하나만 쓴다.
- `localStorage.clear()`를 부르지 않는다. `gardener-replaced:`로 시작하는 키 외에는 읽거나 쓰거나 지우지 않는다. 브라우저로 확인할 때에도 같다.
- 의존 방향: `ui → progress → sim`, `ui → lang`, `progress → lang`, `ui → online`, `online → progress`(자료형만). `lang`, `sim`, `progress`는 DOM, `Date.now`, `Math.random`을 쓰지 않는다(현재 시각이 필요하면 호출하는 쪽이 인자로 넘긴다). `online`은 `ui`를 참조하지 않는다.
- 기존 테스트 511개는 그대로 통과해야 한다. `npm test`, `npx tsc --noEmit`, `npm run build`가 모두 통과해야 작업이 끝난 것이다.
- 단일 파일 빌드가 유지되어야 한다: `npx vite build --base ./`의 결과 `dist/assets`에 js 파일 1개와 css 파일 1개만 있어야 한다(동적 import 금지).
- 화면 문구: 버튼은 "~하기" 또는 명사형, 설명과 안내는 합니다체. 글자 크기는 14px 이상.
- 화면의 그림과 UI 부품은 이미 저장소에 있는 것(`src/assets/kenney`, `src/assets/codmos`)을 쓴다. 새 그림을 직접 그리지 않는다. 분홍색 위주의 배색을 쓰지 않는다. 색은 `src/style.css`의 기존 변수를 쓴다.
- 플레이어가 쓴 글(닉네임, 코드)과 서버에서 읽은 값은 `textContent`로만 화면에 넣는다. `innerHTML`에 넣지 않는다.
- 코드 주석은 한국어로, 기존 코드의 주석 밀도와 말투에 맞춘다. 커밋 메시지는 기존 형식(`feat: …`, `fix: …`, `test: …`, `docs: …`, 한국어)을 따르고 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 줄을 붙인다.
- 같은 저장소에서 다른 작업의 파일이 섞이지 않도록 커밋할 때 파일 경로를 지정한다(`git add <경로>`).
- macOS에는 `timeout` 명령이 없다.
- 개발 서버를 띄울 때 5199 포트는 쓰지 않는다(다른 게임이 쓴다).

## Review Focus

1. **끝나지 않는 코드**: `while True: move(Right)`처럼 목표에 닿지 않는 코드는 화면 실행과 화면 없는 실행 모두 제한 시간에 실패로 끝나야 한다(Task 2, Task 3의 테스트).
2. **실행 도중 화면을 떠남**: 과제나 본편에서 프로그램이 도는 중에 "처음 화면으로"를 누르면 프로그램이 멈추고, 문서에 건 이벤트(키보드 단축키 포함)가 남지 않아야 한다. 화면을 여러 번 오간 뒤 Ctrl+Enter가 한 번만 실행되어야 한다(Task 6의 확인 항목).
3. **손상되었거나 쓸 수 없는 저장소**: 과제 데이터가 깨진 JSON이거나 일부 항목만 잘못되었을 때, 그리고 `localStorage` 접근이 예외를 던질 때에도 게임이 시작되어야 한다(Task 4의 테스트).
4. **느리거나 실패하는 서버**: Firebase 호출이 8초 안에 끝나지 않거나 거부되어도 화면이 멈추지 않고 내 기록은 남아야 한다. 결과 화면의 올리기를 두 번 눌러도 한 번만 올라가야 한다(Task 5의 테스트, Task 9의 확인 항목).
5. **이상한 닉네임**: 앞뒤 공백, 공백만 있는 값, 11자 이상, 이모지, `<b>` 같은 글자가 들어와도 규칙(다듬은 뒤 2~10자)대로 처리되고 화면이 깨지지 않아야 한다(Task 4의 테스트, Task 8의 확인 항목).

---

### Task 1: 과제용 Game 만들기와 과제용 잠금 문구

**Files:**
- Modify: `src/progress/game.ts`, `src/progress/droneApi.ts`, `src/lang/checker.ts`, `src/lang/index.ts`
- Test: `tests/progress/challengeGame.test.ts`

**Interfaces:**
- Produces:
  - `Game.forChallenge(state: WorldState, unlocked: readonly UnlockId[], code: string): Game` — 주어진 상태와 해금 집합으로 게임을 만든다. `game.challenge === true`.
  - `Game.challenge: boolean` (본편은 `false`)
  - `compile(source, opts)`의 `opts`에 선택 항목 `lockedText?: (kind: 'syntax' | 'name' | 'plant', label: string, title: string) => string`를 추가한다. 주지 않으면 지금의 문구를 그대로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/progress/challengeGame.test.ts`에 다음을 확인하는 테스트를 쓴다.
  - `Game.forChallenge(state, ['loop'], 'while True:\n    harvest()\n')`로 만든 게임이 `run()` 후 `tick`을 거쳐 수확한다.
  - 해금 집합에 없는 문법(`if`)을 쓰면 `run()`이 `false`이고 출력의 마지막 줄에 "이 과제에서는 쓸 수 없는 문법입니다: " 가 들어 있으며 "해금 화면"이라는 말은 없다.
  - 해금 집합에 없는 함수(`move(Right)`)를 쓰면 "이 과제에서는 쓸 수 없는 함수입니다: move"가 나온다.
  - 해금 집합에 없는 작물을 심으면 "이 과제에서는 심을 수 없는 작물입니다: 튤립"이 나온다.
  - 해금 집합에 `speed2`가 있으면 `ticksPerSecond()`가 800이다.
  - 본편 게임(`Game.create`)의 잠금 문구는 바뀌지 않았다(기존 문구 전체를 문자열로 비교).
  - 과제 게임에서 `buy()`는 항상 `false`를 돌려주고 상태를 바꾸지 않는다.

- [ ] **Step 2: 테스트가 실패하는지 확인** — `npx vitest run tests/progress/challengeGame.test.ts`

- [ ] **Step 3: 구현**
  - 잠금 문구는 `checker.ts`와 `droneApi.ts`에서 만들어진다. 문구를 만드는 자리를 `lockedText`가 있으면 그것을 쓰도록 바꾸고, 과제 게임은 `Game.run()`에서 위 세 문구를 만드는 함수를 넘긴다.
  - `buildDroneApi`에는 같은 목적의 선택 인자를 추가한다.

- [ ] **Step 4: 전체 테스트 통과 확인** — `npm test && npx tsc --noEmit`

- [ ] **Step 5: 커밋** — `feat: 과제용 게임 생성과 과제용 잠금 문구`

---

### Task 2: 과제 정의와 과제 실행기

**Files:**
- Create: `src/progress/challenges.ts`, `src/progress/challengeRun.ts`
- Test: `tests/progress/challenges.test.ts`, `tests/progress/challengeRun.test.ts`

**Interfaces:**
- Consumes: `Game.forChallenge`(Task 1), `World`, `WorldState`, `WorldEvent`, `nextRandom`(`src/sim/rng.ts`)
- Produces (`challenges.ts`):

```ts
export type Medal = 'bronze' | 'silver' | 'gold'
export type Metric = { kind: 'time' } | { kind: 'count'; event: 'swap' }
export interface ChallengeDef {
  id: string                 // 판 번호 포함. 예: 'c01-first-v1'
  no: number                 // 1부터
  title: string
  concept: string            // 예: '반복'
  brief: string[]            // 인트가 설명하는 문장(합니다체). 목표, 규칙, 재는 것을 담는다
  unlocks: UnlockId[]        // 쓸 수 있는 문법·함수·작물·드론 속도
  goal: { item: ItemKind; amount: number }
  metric: Metric
  limitMs: number            // 시드 하나의 제한 시간
  medals: { gold: number; silver: number; bronze: number } // 기록이 이 값 이하이면 그 등급
  minScore: number           // 보안 규칙에 쓰는 하한. 이론상 가능한 가장 좋은 기록 이하여야 한다
  seeds: number[]            // 길이 1 또는 3
  setup(seed: number): WorldState
}
export const CHALLENGES: ChallengeDef[]
export function challengeById(id: string): ChallengeDef | undefined
export function medalFor(def: ChallengeDef, score: number): Medal | null
export function formatScore(def: ChallengeDef, score: number): string // 시간: '12.35초', 횟수: '14번'
export function goalText(def: ChallengeDef): string                   // '딸기 6개 모으기'
```

- Produces (`challengeRun.ts`):

```ts
export const STEP_MS = 50
export type RunStatus = 'ready' | 'running' | 'success' | 'failed'
export type FailReason = 'timeout' | 'error' | 'ended' | 'stopped'
export type ActionKind = 'move' | 'harvest' | 'plant' | 'water' | 'swap' | 'fail'
export interface RunStats { timeMs: number; actions: number; counts: Record<ActionKind, number> }
export class ChallengeRun {
  readonly def: ChallengeDef
  readonly seed: number
  readonly game: Game
  constructor(def: ChallengeDef, seed: number, code: string)
  get status(): RunStatus
  get reason(): FailReason | null
  get stats(): RunStats          // actions는 counts의 합(실패한 동작 포함)
  get progress(): number         // 목표 자원을 지금 가진 수(내림)
  get score(): number | null     // 성공했을 때에만 값이 있다
  start(): boolean               // 컴파일하고 실행을 시작한다. 컴파일 오류면 false이고 status는 'failed', reason은 'error'
  stepOnce(): void               // 'ready'이면 시작한 뒤 한 문장을 실행하고 멈춘다
  resume(): void                 // 한 단계 실행으로 멈춘 것을 이어서 실행한다
  advance(ms: number): void      // ms를 쌓아 두고 STEP_MS 단위로만 진행한다. 끝난 뒤에는 아무 일도 하지 않는다
  stop(): void                   // 실행 중이면 status 'failed', reason 'stopped'
  takeEvents(): WorldEvent[]     // 지난 호출 뒤에 생긴 이벤트(횟수는 이미 센 것)
}
export const FAIL_TEXT: Record<FailReason, string> // 합니다체 한 문장씩
```

**진행 규칙(한 단위 = `game.tick(STEP_MS)` 한 번):**
1. `game.tick(STEP_MS)`를 부른 뒤 `game.world.takeEvents()`로 이벤트를 가져와 종류별로 세고, 화면에 넘겨줄 목록에 쌓는다(`wilt`는 세지 않는다).
2. 목표 자원이 목표 이상이면 `success`. 기록은 `metric`이 `time`이면 `game.world.state.timeMs`, `count`이면 그 이벤트의 횟수.
3. 그렇지 않고 `game.status === 'error'`이면 `failed/error`, `game.status === 'idle'`이면 `failed/ended`, 시간이 `limitMs` 이상이면 `failed/timeout`.
4. 끝나면 `game.stop()`을 부르고 그 뒤의 `advance`는 무시한다.

**과제 8개의 처음 값**(Task 3에서 기준 풀이로 조정한다. `medals`, `limitMs`, `minScore`는 이 작업에서는 넉넉한 임시 값을 넣고 Task 3이 확정한다):

| id | title | concept | unlocks | setup | goal | metric | seeds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `c01-first-v1` | 첫 수확 | 반복 | loop | 1×1, 다 자란 데이지 | Daisy 5 | time | 1개 |
| `c02-row-v1` | 한 줄 훑기 | 이동 | loop, expand1 | 3×1, 다 자란 데이지 3 | Daisy 12 | time | 1개 |
| `c03-ripe-v1` | 익은 것만 | 조건문 | loop, expand1, cond, strawberry | 3×1 빈 칸, Daisy 10 보유 | Strawberry 6 | time | 1개 |
| `c04-grid-v1` | 격자 훑기 | for, 좌표 | loop, expand1, cond, var, func, for, speed2 | 3×3, 다 자란 데이지 9 | Daisy 40 | time | 1개 |
| `c05-water-v1` | 물 관리 | 물, 변수 | loop, expand1, cond, strawberry, watering, var | 3×1 빈 칸, Daisy 30, Water 10, waterCap 20 | Strawberry 15 | time | 1개 |
| `c06-sunflower-v1` | 가장 큰 해바라기 | 리스트, 최댓값 | loop, expand1, cond, var, func, for, sunflower, list, speed2 | 4×4, 다 자란 해바라기 16(꽃잎 수는 시드로 7~15), Strawberry 20 | Power 40 | time | 3개 |
| `c07-tomato-v1` | 토마토 군집 | 격자 탐색 | 6번의 것 + tulip, tomato | 4×4 빈 칸, Tulip 60 | Tomato 100 | time | 3개 |
| `c08-crate-v1` | 상자 정렬 | 정렬 | 7번의 것 + dict, crate | 3×3, 과일 상자 9(무게는 시드로 0~9), 다 자란 상태 | Coin 81 | count: swap | 3개 |

`setup`은 매번 새 객체를 돌려준다. `yieldMult`는 모두 1, 드론은 (0,0), `timeMs` 0, `rng`는 시드에서 정한다. 무작위 값(꽃잎 수, 상자 무게)은 `nextRandom`으로 시드에서 뽑는다. 8번의 시드는 처음부터 정렬된 배치가 나오지 않는 것으로 고른다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/progress/challenges.test.ts`:
  - `CHALLENGES`가 8개이고 `no`가 1~8, `id`가 서로 다르며 모두 `-v1`로 끝난다.
  - 모든 과제의 `setup(seed)` 결과가 본편 저장 검증(`deserialize`가 받아들이는 `world` 범위)을 통과하는 모양이다: 칸 수 = w×h, 값의 범위, 꽃잎 수 7~15, 상자 무게 0~9.
  - `setup`을 두 번 부르면 서로 다른 객체이고 내용은 같다. 시드가 다르면 6번, 8번의 값 배열이 다르다.
  - `medals.gold < medals.silver < medals.bronze`, `minScore <= medals.gold`, `seeds.length`가 1 또는 3.
  - `medalFor`: 금 기준과 같은 값은 금, 동 기준보다 크면 `null`.
  - `formatScore`: 시간 12350 → `'12.35초'`, 횟수 14 → `'14번'`.
  - 8번의 모든 시드에서 처음 상태가 "모두 정렬됨"이 아니다(`sortedCrateGroup`의 길이가 9가 아님).

`tests/progress/challengeRun.test.ts`:
  - 1번 과제에 `while True:\n    harvest()\n`을 넣으면 성공하고, 기록이 50의 배수이며 양수이다.
  - 같은 코드와 같은 시드로 두 번 실행하면 `score`와 `stats`가 같다.
  - `advance(16)`를 되풀이한 실행과 `advance(250)`를 되풀이한 실행의 `score`가 같다(프레임 시간과 무관).
  - 실패 네 가지: `while True:\n    move(Right)\n`(2번 과제) → `timeout`; `harvest(1)` 같은 실행 오류 → `error`; `harvest()` 한 줄 → `ended`; 실행 중 `stop()` → `stopped`.
  - 컴파일 오류 코드로 `start()`하면 `false`, `failed/error`.
  - 끝난 뒤의 `advance`는 `stats.timeMs`를 바꾸지 않는다.
  - `takeEvents()`가 돌려준 이벤트의 수와 `stats.counts`의 합이 맞는다(`wilt` 제외). `stats.actions`에는 실패한 수확도 들어간다.
  - 8번 과제에서 `swap` 성공 횟수가 `score`가 된다(직접 정렬하는 짧은 코드 대신, `swap(Right)` 두 번 뒤 프로그램이 끝나는 코드로 `counts.swap === 2`만 확인해도 된다).
  - `stepOnce()`는 `ready`에서 실행을 시작하고, 그 뒤 `advance`해도 프로그램 문장이 더 실행되지 않으며 시간만 흐른다. `resume()` 뒤에는 이어서 실행된다.

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/progress/challenges.test.ts tests/progress/challengeRun.test.ts`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 전체 테스트와 타입 검사 통과 확인**
- [ ] **Step 5: 커밋** — `feat: 도전 과제 8개의 정의와 과제 실행기`

---

### Task 3: 심사(여러 시드 실행), 기준 풀이, 등급 기준 확정

**Files:**
- Create: `src/progress/challengeJudge.ts`, `tests/model/challengeSolutions.ts`
- Modify: `src/progress/challenges.ts`(수치 확정), `docs/superpowers/specs/2026-10-12-challenges-ranking-design.md`(4.4절의 표와 9절)
- Test: `tests/progress/challengeJudge.test.ts`, `tests/challengeBalance.test.ts`

**Interfaces:**
- Consumes: `ChallengeRun`, `ChallengeDef`(Task 2)
- Produces:

```ts
export interface SeedResult { seed: number; status: 'success' | 'failed'; reason: FailReason | null; score: number | null; stats: RunStats; errorText: string | null }
export interface JudgeResult {
  ok: boolean              // 모든 시드에서 성공
  score: number | null     // 시드별 기록의 합. ok일 때에만 값이 있다
  actions: number          // 시드별 동작 횟수의 합
  results: SeedResult[]    // def.seeds의 순서
  failedSeed: number | null // 처음 실패한 시드
}
export function runSeed(def: ChallengeDef, seed: number, code: string): SeedResult // 화면 없이 끝까지 실행
export function judge(def: ChallengeDef, code: string, known?: SeedResult[]): JudgeResult // known에 있는 시드는 다시 실행하지 않는다
```

- `tests/model/challengeSolutions.ts`: `export const SOLUTIONS: Record<string, { simple: string; tuned: string }>` — 과제 id마다 단순한 풀이와 잘 다듬은 풀이. 각 풀이는 그 과제의 `unlocks`만으로 컴파일되어야 한다.

**기준 풀이와 수치 확정 규칙:**
- `simple`은 본편의 안내 예제 수준의 풀이(그 과제를 처음 푼 사람이 쓸 만한 코드)이고, `tuned`는 과제의 요령을 쓴 풀이이다(이동 경로 줄이기, 기다리는 시간 줄이기, 물 쓰기, 최댓값 위치로 곧장 가기, 정사각형이 찰 때까지 시든 것 다시 심기, swap을 줄이는 정렬).
- 등급 기준: `gold = tuned 기록 × 1.08`을 시간이면 50의 배수로 올림, 횟수이면 올림. `bronze = simple 기록 × 1.15`를 같은 방식으로 올림. `silver`는 둘의 가운데. `simple`과 `tuned`의 기록 차이가 10% 미만인 과제(1번, 2번이 그럴 수 있다)는 `gold = tuned 기록 그대로`, `silver = gold × 1.1`, `bronze = gold × 1.3`으로 둔다.
- `limitMs = max(60_000, simple의 시드 하나 기록 × 3)`을 10초 단위로 올림. 8번(횟수 과제)의 `limitMs`는 `simple`이 걸린 시간의 3배로 정한다.
- `minScore`: 증명할 수 있는 느슨한 하한을 직접 계산하여 넣고, 계산 근거를 주석 한 줄로 적는다(예: 1번은 데이지 5개에 다시 자라는 시간 2초가 네 번 필요하므로 8000). 근거를 댈 수 없으면 `tuned 기록 × 0.5`를 내림하여 넣는다.
- 5번(물 관리)은 "물을 쓰지 않는 풀이는 금을 못 받고, 물을 쓰는 풀이는 금을 받는다"가 성립해야 한다. 처음 값으로 성립하지 않으면 선반 크기, 목표 수, 처음 물의 양, 심는 작물(딸기 또는 튤립)을 조정하여 성립하게 만들고, 바꾼 값을 설계 문서의 표에 반영한다. 본편의 수치(`balance.ts`)는 바꾸지 않는다.
- 6번은 `simple`(전부 재고 가장 큰 것으로 감)과 `tuned`의 차이가 드러나야 하고, 7번은 3개 시드 모두에서 `tuned`가 성공해야 한다. 성립하지 않으면 그 과제의 처음 값을 조정하고 설계 문서에 반영한다.
- 과제의 처음 값을 바꾸더라도 id는 `-v1`로 둔다(아직 배포한 적이 없다).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/progress/challengeJudge.test.ts`:
  - `judge`의 `score`가 `runSeed` 결과의 합과 같다.
  - 한 시드에서만 실패하는 코드(예: 6번에서 첫 시드의 답을 좌표로 직접 적은 코드)는 `ok === false`이고 `failedSeed`가 그 시드이다.
  - `known`에 첫 시드의 결과를 주면 그 결과 객체가 그대로 `results[0]`에 들어간다.
  - 끝나지 않는 코드도 `judge`가 끝나며, 8개 과제 각각에서 `while True:\n    move(Right)\n`(1번은 `while True:\n    print(1)\n`)의 `judge`가 2초 안에 끝난다(`performance.now()`로 잰다).
  - `runSeed`의 결과가 `ChallengeRun`을 `advance(16)`로 돌린 결과와 같다.

`tests/challengeBalance.test.ts`: 모든 과제에 대해
  - `simple`과 `tuned`가 `judge`에서 `ok`이다.
  - `medalFor(tuned 기록) === 'gold'`, `medalFor(simple 기록)`이 `null`이 아니다.
  - `tuned 기록 >= minScore`.
  - 5번: 물을 쓰지 않는 풀이의 등급이 금이 아니다.
  - 시드 하나의 기록이 `limitMs`의 절반 이하이다(simple 기준, 시간 과제).
  - 풀이가 그 과제의 `unlocks`만으로 컴파일된다(`judge`가 `error`로 실패하지 않으면 충족).

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: `challengeJudge.ts` 구현, 기준 풀이 작성, 수치 확정** — 기록을 표로 출력하는 임시 스크립트를 써도 되지만 커밋하지 않는다.
- [ ] **Step 4: 설계 문서 갱신** — 4.4절의 표를 확정한 값으로 고치고 등급 기준과 제한 시간 열을 추가한다. 9절의 "여러 프레임에 나누어 실행합니다"를 실제 구현(한 번에 실행하며, 테스트가 2초 상한을 확인한다)에 맞게 고친다. 문서는 사람이 읽는 한국어 문서이므로 완성된 문장으로 쓴다.
- [ ] **Step 5: 전체 테스트 통과 확인**
- [ ] **Step 6: 커밋** — `feat: 과제 심사와 기준 풀이, 등급 기준 확정`

보고서에는 과제별 `simple`/`tuned` 기록과 확정한 등급 기준, 조정한 처음 값을 표로 적는다.

---

### Task 4: 과제 데이터 저장과 본편 수입 계산

**Files:**
- Create: `src/progress/challengeSave.ts`, `src/progress/income.ts`
- Test: `tests/progress/challengeSave.test.ts`, `tests/progress/income.test.ts`

**Interfaces:**
- Consumes: `StorageLike`(`src/progress/save.ts`), `CHALLENGES`
- Produces (`challengeSave.ts`):

```ts
export const CHALLENGE_KEY = 'gardener-replaced:challenges:v1'
export const MAX_CODE_CHARS = 20_000
export interface ChallengeRecord { score: number; actions: number; lines: number; code: string; at: number; uploaded: boolean }
export interface ChallengeData {
  version: 1
  nickname: string | null
  records: Record<string, ChallengeRecord>
  drafts: Record<string, string>
  seenIntro: string[]
}
export function emptyChallengeData(): ChallengeData
export function loadChallengeData(storage: StorageLike): ChallengeData   // 예외를 던지지 않는다
export function saveChallengeData(storage: StorageLike, data: ChallengeData): boolean
export function cleanNickname(input: string): string | null // 앞뒤 공백을 지우고 안쪽의 연속 공백을 하나로 줄인 뒤, 글자 수(코드 포인트 기준)가 2~10이면 그 값, 아니면 null. 제어 문자가 있으면 null
export function countLines(code: string): number           // 빈 줄과 '#'으로 시작하는 줄(앞 공백 무시)은 세지 않는다
export function isBetter(def: ChallengeDef, score: number, old: ChallengeRecord | undefined): boolean
```

  - 불러올 때의 검증: 최상위가 객체가 아니거나 `version !== 1`이면 빈 데이터. `nickname`은 `cleanNickname`을 통과한 값과 같아야 하고 아니면 `null`. `records`와 `drafts`는 항목별로 검사하여 잘못된 항목만 버린다: 키가 지금의 `CHALLENGES`에 있는 id, `score`·`actions`·`lines`는 0 이상의 안전한 정수, `score >= def.minScore`, `code`는 `MAX_CODE_CHARS` 이하의 문자열, `at`은 0 이상의 유한한 수, `uploaded`는 불리언. `seenIntro`는 알려진 id만 남긴다.
  - `MAX_CODE_CHARS`를 넘는 초안은 저장할 때 잘라내지 않고 그 항목만 저장하지 않는다.

- Produces (`income.ts`):

```ts
export const INCOME_WINDOW_MS = 60_000
export class IncomeMeter {
  add(item: ItemKind, amount: number, timeMs: number): void
  perMinute(nowMs: number): Partial<Record<ItemKind, number>> // 최근 60초의 합. 0인 자원은 넣지 않는다
  reset(): void
}
```
  - 60초보다 오래된 기록은 버린다. 시간이 거꾸로 가면(`nowMs`가 마지막 기록보다 작으면) 모두 버린다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `challengeSave`: 왕복 저장, 깨진 JSON → 빈 데이터, `getItem`이 예외를 던지는 저장소 → 빈 데이터, `setItem`이 예외를 던지면 `saveChallengeData`가 `false`, 한 기록만 잘못된 데이터에서 나머지 기록과 초안과 닉네임이 유지됨, 알 수 없는 과제 id의 기록 버림, `minScore`보다 작은 기록 버림.
  - `cleanNickname`: `'  인트  '` → `'인트'`, `'a'` → `null`, 11자 → `null`, 10자 → 그대로, `'   '` → `null`, `'가  나'` → `'가 나'`, `'🙂🙂'` → `'🙂🙂'`(코드 포인트 2개), `'<b>x</b>'` → 그대로(8자), 줄바꿈이나 탭이 든 값 → `null`.
  - `countLines`: 빈 줄, 공백만 있는 줄, `   # 주석` 줄은 0으로 세고, `x = 1  # 주석`은 1로 센다.
  - `isBetter`: 기록이 없으면 `true`, 같은 기록은 `false`, 더 작은 기록은 `true`.
  - `IncomeMeter`: 60초 창, 경계(정확히 60초 전의 기록은 버림), `reset`, 시간 역행.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**
- [ ] **Step 4: 전체 테스트 통과 확인**
- [ ] **Step 5: 커밋** — `feat: 과제 데이터 저장과 분당 수입 계산`

---

### Task 5: 랭킹 서비스(Firebase)와 보안 규칙

**Files:**
- Create: `src/online/ranking.ts`, `src/online/firebaseRanking.ts`, `src/online/firebaseConfig.ts`, `src/online/index.ts`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `vitest.rules.config.ts`, `tests-rules/firestore.rules.test.ts`
- Modify: `package.json`(의존 패키지와 `test:rules` 스크립트), `README.md`(규칙 테스트와 배포 방법 절)
- Test: `tests/online/ranking.test.ts`, `tests/online/rulesFloors.test.ts`

**Interfaces:**
- Consumes: `CHALLENGES`(id와 `minScore`)
- Produces (`ranking.ts`):

```ts
export interface RankEntry { nickname: string; score: number; mine: boolean }
export interface Board { top: RankEntry[]; myRank: number | null; myScore: number | null }
export interface Submission { challengeId: string; nickname: string; score: number; actions: number; lines: number; code: string }
export type SubmitResult = 'ok' | 'kept' | 'failed' // kept: 서버에 이미 같거나 더 좋은 기록이 있다(닉네임만 갱신했을 수 있다)
export interface RankingService {
  readonly enabled: boolean                                   // false이면 화면이 랭킹 대신 안내 문장을 보여 준다
  submit(s: Submission): Promise<SubmitResult>                // 예외를 던지지 않는다
  board(challengeId: string): Promise<Board | null>           // 닿지 않으면 null. 예외를 던지지 않는다
}
export const offlineRanking: RankingService                   // enabled false, submit 'failed', board null
export const CALL_TIMEOUT_MS = 8000
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> // 거부되거나 늦으면 fallback
```

- Produces (`firebaseConfig.ts`): `export const FIREBASE_CONFIG: { apiKey: string; authDomain: string; projectId: string; appId: string } | null = null` — 지금은 `null`이며, 사용자가 값을 주면 채운다.
- Produces (`index.ts`): `export function createRanking(): RankingService` — `FIREBASE_CONFIG`가 `null`이면 `offlineRanking`, 아니면 Firebase 구현. 초기화가 예외를 던져도 `offlineRanking`을 돌려준다.

**Firebase 구현(`firebaseRanking.ts`):**
- `firebase/app`의 `initializeApp`, `firebase/auth`의 `getAuth`·`signInAnonymously`, `firebase/firestore/lite`를 **정적 import**로 쓴다. 로그인은 처음 `submit`이나 `board`가 불릴 때 한 번 하고 결과(Promise)를 재사용한다.
- 가장 먼저 `firebase/firestore/lite`에서 집계 함수(`getCount`)가 import되고 빌드되는지 확인한다. 되지 않으면 전체 `firebase/firestore`의 `getCountFromServer`를 쓰고, 그 사실과 번들 크기 변화를 보고서에 적는다. 공식 문서로 현재 SDK의 import 경로와 호출 형태를 확인한 뒤 구현한다(`context7`의 Firebase 문서 또는 firebase.google.com).
- 문서 경로: `challenges/{challengeId}/scores/{uid}`에 `{ nickname, score, actions, lines, at: serverTimestamp() }`, `challenges/{challengeId}/scores/{uid}/private/code`에 `{ code }`.
- `submit`: 내 문서를 읽어, 없거나 내 기록이 더 좋으면 두 문서를 한 묶음(`writeBatch`)으로 쓴다(`'ok'`). 서버 기록이 같거나 더 좋으면 닉네임이 다를 때에만 닉네임을 고치고(`score`와 `at`은 그대로) `'kept'`. 어떤 단계든 실패하면 `'failed'`.
- `board`: `orderBy('score')`, `orderBy('at')`, `limit(20)`으로 상위 20개를 읽고, 내 문서를 읽어 `myScore`를 정한 뒤, 기록이 있으면 `where('score', '<', myScore)`의 개수 + 1을 `myRank`로 한다. 상위 목록에 내 uid가 있으면 `mine: true`.
- 같은 과제의 `board` 결과는 60초 동안 메모리에 두고 다시 읽지 않는다. `submit`이 `'ok'`를 돌려주면 그 과제의 캐시를 지운다.
- 같은 과제에 대한 `submit`이 진행 중일 때 다시 불리면 같은 Promise를 돌려준다(두 번 눌러도 한 번만 올라간다).
- 모든 서버 호출은 `withTimeout`으로 감싼다.

**보안 규칙(`firestore.rules`):** 설계 문서 7.3절을 그대로 구현한다.
- `scores/{uid}`: 읽기는 누구나. 생성은 로그인한 본인만, 필드는 정확히 `nickname`, `score`, `actions`, `lines`, `at`; `nickname`은 문자열이고 길이 2~10(규칙의 문자열 `size()`는 코드 포인트가 아닐 수 있으므로 규칙에서는 2~40으로 넉넉히 두고 그 까닭을 주석으로 적는다. 정확한 검사는 클라이언트의 `cleanNickname`이 한다); `score`·`actions`·`lines`는 정수이고 0 이상, `score >= 과제별 하한`, `actions <= 1_000_000`, `lines <= 2000`; `at == request.time`; 과제 id가 하한 표에 없으면 거부.
- 갱신: 본인만, 필드 검사는 같고, (가) `score < resource.data.score`이고 `at == request.time`이거나, (나) `score`·`actions`·`lines`·`at`이 그대로이고 `nickname`만 바뀐 경우만 허용.
- 삭제 거부.
- `scores/{uid}/private/code`: 본인만 읽기·쓰기, 필드는 `code` 하나, 문자열이고 길이 20,000 이하. 삭제 거부. 그 밖의 `private` 문서 id는 거부.
- 그 밖의 모든 경로는 거부(재귀 와일드카드로 열지 않는다).
- 과제별 하한은 규칙 파일 안의 상수 표로 둔다. 규칙 언어의 map 리터럴이 에뮬레이터에서 동작하는지 먼저 확인하고, 동작하지 않으면 조건식 나열로 바꾼다.
- `firestore.indexes.json`: 컬렉션 `scores`(컬렉션 범위), `score` 오름차순 + `at` 오름차순.
- `firebase.json`: 규칙 파일과 색인 파일의 경로, 그리고 에뮬레이터 설정(Firestore와 Auth. Auth 에뮬레이터는 Task 9의 브라우저 확인에서 쓴다)을 담는다.

**규칙 테스트:** `tests-rules/`에 두고 `npm test`에는 포함하지 않는다. `package.json`에 `"test:rules": "firebase emulators:exec --only firestore --project demo-autofarm \"vitest run --config vitest.rules.config.ts\""`를 추가한다. `firebase-tools`와 `@firebase/rules-unit-testing`은 devDependencies에 넣는다. 이 컴퓨터의 Java는 17이다. 최신 `firebase-tools`가 더 높은 Java를 요구하면 Java 17에서 도는 가장 최신의 주 버전으로 고정하고 그 사실을 README와 보고서에 적는다. 에뮬레이터를 끝내 띄울 수 없으면 추측으로 통과 처리하지 말고 BLOCKED로 보고한다.

- [ ] **Step 1: 의존 패키지 설치와 lite 집계 확인** — `npm install firebase`, `npm install -D firebase-tools @firebase/rules-unit-testing`. 작은 임시 파일로 import가 타입 검사와 빌드를 통과하는지 확인한다.

- [ ] **Step 2: 실패하는 테스트 작성**
  - `tests/online/ranking.test.ts`: `offlineRanking`의 세 동작; `withTimeout`이 늦는 Promise(가짜 타이머)와 거부되는 Promise에 fallback을 돌려줌; `createRanking()`이 설정값이 `null`일 때 `enabled === false`.
  - `tests/online/rulesFloors.test.ts`: `firestore.rules` 파일을 읽어, 모든 과제의 `id`와 `minScore`가 규칙의 하한 표에 그 값으로 들어 있고, 표에 `CHALLENGES`에 없는 id가 없는지 확인한다(과제 수치를 바꾸고 규칙을 잊는 일을 막는다).
  - `tests-rules/firestore.rules.test.ts`(에뮬레이터): 본인 생성 성공; 로그인하지 않은 쓰기 거부; 남의 uid 문서 쓰기 거부; 하한보다 작은 `score` 거부; 알 수 없는 과제 id 거부; 필드 추가 거부; 필드 누락 거부; `at`이 서버 시각이 아니면 거부; 더 나쁜 기록과 같은 기록으로 갱신 거부; 더 좋은 기록으로 갱신 성공; 닉네임만 갱신 성공; 닉네임을 바꾸면서 `score`를 나쁘게 바꾸기 거부; 삭제 거부; `private/code` 본인 읽기·쓰기 성공, 남이 읽기 거부, 로그인하지 않은 읽기 거부, 20,001자 거부; `scores` 목록 읽기는 로그인 없이 성공; 그 밖의 경로(`challenges/x` 문서, `other/y`) 읽기·쓰기 거부.

- [ ] **Step 3: 실패 확인** — `npx vitest run tests/online`, `npm run test:rules`
- [ ] **Step 4: 구현**
- [ ] **Step 5: 통과 확인** — `npm test && npx tsc --noEmit && npm run test:rules`
- [ ] **Step 6: 단일 파일 빌드 확인** — `npx vite build --base ./ && ls dist/assets`에 js 1개, css 1개. 빌드한 js의 크기를 Firebase를 넣기 전(직전 커밋)과 비교하여 보고서에 적는다. `tests-rules`와 규칙 테스트용 패키지가 본 빌드에 들어가지 않았는지 확인한다.
- [ ] **Step 7: README 갱신** — "랭킹과 Firebase" 절: 설정값을 넣는 파일, 규칙 테스트 실행법(Java 필요), 규칙과 색인을 배포하는 방법(`npx firebase login` 뒤 `npx firebase deploy --only firestore --project <프로젝트 id>`, 또는 콘솔의 규칙 탭에 붙여 넣기), 무료 한도. 사람이 읽는 한국어 문서이므로 완성된 문장으로 쓴다.
- [ ] **Step 8: 커밋** — `feat: Firebase 랭킹 서비스와 보안 규칙`

---

### Task 6: 화면 전환, 시작 화면, 본편의 정리와 분당 수입 표시

**Files:**
- Create: `src/ui/router.ts`, `src/ui/startScreen.ts`, `src/ui/console.ts`
- Modify: `src/ui/app.ts`, `src/main.ts`, `src/ui/greenhouse.ts`, `src/ui/editor.ts`, `src/ui/panels.ts`, `src/ui/guideBubble.ts`, `src/ui/audio.ts`(필요하면), `src/style.css`
- Test: `tests/ui/startScreen.test.ts`(순수 함수만), 브라우저 확인

**Interfaces:**
- Consumes: `IncomeMeter`(Task 4), `loadGame`·`saveGame`(`save.ts`), `SAVE_KEY`
- Produces:

```ts
// router.ts
export interface Screen { frame(dtMs: number): void; destroy(): void }
export type Route = { name: 'start' } | { name: 'main' } | { name: 'challenges' } | { name: 'challenge'; id: string }
export interface RouterDeps { storage: StorageLike; audio: Audio; ranking: RankingService; now: () => number; seed: () => number }
export interface Router { frame(dtMs: number): void; go(route: Route): void }
export function createRouter(root: HTMLElement, deps: RouterDeps): Router
// 과제 목록과 과제 화면은 Task 7, Task 8에서 만든다. 이 작업에서는 'challenges'와 'challenge' 경로가
// "준비 중입니다."라는 한 문장과 "처음 화면으로" 버튼만 있는 임시 화면을 보여 준다.

// startScreen.ts
export function startLabel(hasSave: boolean): string // '이어하기' | '시작하기'
export function hasMainSave(storage: StorageLike): boolean // SAVE_KEY에 값이 있는지. 예외를 던지지 않는다
export function createStartScreen(root: HTMLElement, opts: { hasSave: boolean; onStart(): void; onChallenges(): void; audio: Audio }): Screen

// console.ts — 편집기, 실행 단추, 상태등, 기록 칸을 묶은 부품. 본편과 과제 화면이 함께 쓴다.
export interface ConsoleHooks { onRun(): void; onStop(): void; onStep(): void; onEdit(code: string): void }
export interface ConsoleView {
  readonly root: HTMLElement
  readonly editor: Editor
  readonly toolbar: HTMLElement                 // 과제 화면이 배속 단추를 덧붙인다
  render(game: Game, extra: { stateText: string; note: string; stale: OutputLine | null }): void
  destroy(): void
}
export function createConsole(host: HTMLElement, code: string, hooks: ConsoleHooks, audio: Audio): ConsoleView

// app.ts
export interface App extends Screen { /* 기존 멤버 유지 */ }
export function createApp(root: HTMLElement, game: Game, storage: StorageLike, opts: { audio: Audio; onExit(): void }): App
```

**요구 사항:**
- `main.ts`는 저장소와 소리를 한 번 만들고 `createRouter`를 시작한다. 프레임 반복은 `router.frame(dt)`만 부른다. 처음 경로는 `start`이다.
- 시작 화면: 설계 문서 3.1절. 정거장 배경(본편 온실 장면의 벽·창·별의 색과 요소를 따른다), 드론과 인트와 화분 그림, 제목 "오토팜 스테이션", 큰 버튼 두 개("시작하기" 또는 "이어하기", "도전 과제"). 글자는 제목과 버튼뿐이다. 화면이 나타나면 첫 버튼에 초점이 놓이고, Tab과 Enter로 조작된다. 버튼을 누르면 `click` 소리가 난다. `prefers-reduced-motion`이면 움직임을 끈다. 창 너비 1280px와 1920px에서 모두 가운데에 놓이고 잘리지 않는다.
- 본편: 위쪽 막대의 "해금" 왼쪽에 "처음 화면으로" 버튼을 추가한다(기존 `hud-btn` 모양, 기존 아이콘 묶음에서 어울리는 아이콘). 누르면 바로 저장하고(`flushSave`) `game.stop()`을 부른 뒤 `opts.onExit()`.
- `destroy()`: 본편 화면이 만든 모든 것을 해제한다. `document`와 `window`에 건 이벤트(키보드, `visibilitychange`, `pagehide`)는 `AbortController`의 `signal`로 걸어 한 번에 해제하고, 타이머, `ResizeObserver`, CodeMirror 뷰(`view.destroy()`), 열려 있는 화면(panel)과 말풍선의 타이머를 정리하며, 마지막에 저장한 뒤 `root`를 비운다. 이를 위해 `Greenhouse`, `Panels`, `GuideBubble`, `Editor`에 `destroy()`를 추가한다. `destroy()` 뒤에 `frame()`이 불려도 예외가 나지 않아야 한다.
- 소리 객체는 화면마다 새로 만들지 않고 `deps.audio` 하나를 쓴다. 소리 켜짐 설정은 지금처럼 본편의 `game.settings.sound`를 따른다.
- `console.ts`로 꺼내는 것은 동작을 바꾸지 않는 옮기기이다. 본편의 실행·정지·한 단계 실행, 오류 줄 강조, 실행 줄 흔적, 지난 출력 흐리게 표시, 상태등, 단축키(Ctrl/⌘+Enter, Esc)의 동작이 옮기기 전과 같아야 한다.
- 분당 수입: `app.ts`가 `IncomeMeter`를 갖고, `harvest` 이벤트를 `game.world.state.timeMs`와 함께 넣는다. `Greenhouse.render`에 선택 인자 `extra?: { income?: Partial<Record<ItemKind, number>> }`를 추가하여, 자원 칸의 수 아래에 "분당 +12" 형식으로 표시한다(값은 반올림한 정수, 0이면 표시하지 않음, 1초에 한 번만 갱신). 6가지 자원이 모두 보이는 6×6 선반에서도 글자가 겹치거나 14px보다 작아지지 않아야 한다. 자리가 모자라면 칸의 높이를 조정한다.
- 본편 화면에서 시작 화면으로 갔다가 "이어하기"로 돌아오면 저장된 상태(코드, 자원, 해금)가 그대로여야 한다. 시작 화면에 있는 동안 본편의 시간은 흐르지 않는다.

- [ ] **Step 1: 순수 함수 테스트 작성과 실패 확인** — `startLabel`, `hasMainSave`(값이 있음, 없음, `getItem`이 예외를 던짐).
- [ ] **Step 2: `console.ts`로 옮기기** — 옮긴 뒤 `npm test`와 타입 검사.
- [ ] **Step 3: `destroy()`와 router, 시작 화면, `main.ts`**
- [ ] **Step 4: 분당 수입 표시**
- [ ] **Step 5: 브라우저 확인** — 화면 없는 Chrome(`--headless=new --remote-debugging-port=<포트> --user-data-dir=<임시 폴더>`)을 CDP로 조작하여 확인하고, 캡처를 `.superpowers/sdd/` 아래 이 계획의 작업 폴더에 저장한다. 저장 상태가 필요하면 실제 `Game`과 `serialize`로 만든 JSON을 `gardener-replaced:save:v1`에 넣는다. 확인 항목:
  1. 저장이 없을 때 "시작하기", 있을 때 "이어하기"로 보인다(1280×800, 1920×1080 캡처).
  2. 시작 → 본편 → 처음 화면으로 → 이어하기를 다섯 번 되풀이한 뒤 Ctrl+Enter를 한 번 누르면 프로그램이 한 번만 시작된다(`document`에 남은 리스너가 없음을 `getEventListeners` 또는 실행 횟수로 확인).
  3. 본편에서 프로그램 실행 중에 "처음 화면으로"를 누르고 돌아오면 프로그램은 멈춰 있고 코드와 자원은 그대로이다.
  4. 본편의 실행, 정지, 한 단계 실행, 오류 줄 강조, 해금 구입, 설명서, 설정, 안내 말풍선이 예전처럼 동작한다.
  5. 4×4 선반에서 프로그램을 60초 넘게 돌렸을 때 자원 칸에 "분당 +N"이 보이고 글자가 겹치지 않는다(캡처). 6×6 선반과 자원 6종 상태의 캡처도 남긴다.
  6. 콘솔 오류가 없다.
- [ ] **Step 6: 전체 테스트, 타입 검사, 빌드 통과 확인**
- [ ] **Step 7: 커밋** — `feat: 시작 화면과 화면 전환, 본편의 분당 수입 표시`(옮기기는 별도 커밋 `refactor: 편집기와 실행 단추를 console 모듈로 분리`)

---

### Task 7: 과제 목록 화면

**Files:**
- Create: `src/ui/challengeList.ts`
- Modify: `src/ui/router.ts`, `src/style.css`
- Test: `tests/ui/challengeList.test.ts`(순수 함수만), 브라우저 확인

**Interfaces:**
- Consumes: `CHALLENGES`, `medalFor`, `formatScore`, `loadChallengeData`, `saveChallengeData`, `cleanNickname`, `RankingService`, `Screen`
- Produces:

```ts
export interface CardInfo { no: number; title: string; concept: string; best: string; medal: Medal | null }
export function cardInfo(def: ChallengeDef, record: ChallengeRecord | undefined): CardInfo // best는 기록이 없으면 '기록 없음'
export function medalCount(data: ChallengeData): { gold: number; silver: number; bronze: number }
export function createChallengeList(root: HTMLElement, opts: {
  storage: StorageLike; audio: Audio; ranking: RankingService; now: () => number
  onBack(): void; onOpen(id: string): void
}): Screen
```

**요구 사항:**
- 설계 문서 3.3절. 위쪽 막대에 "처음 화면으로", 화면 제목 "도전 과제", 닉네임 영역이 있다.
- 과제 카드 8장을 격자로 놓는다(1280px에서 4열 2행). 카드에는 번호, 이름, 다루는 개념, 내 최고 기록, 등급(금·은·동의 색 표시와 글자, 없으면 빈 자리 표시)을 보여 주고, 카드 전체가 버튼이다. 키보드로 초점을 옮기고 Enter로 열 수 있다.
- 등급은 색만으로 구분하지 않고 글자("금", "은", "동")를 함께 쓴다.
- 닉네임 영역: 닉네임이 없으면 입력 칸과 "정하기" 버튼, 있으면 닉네임과 "바꾸기" 버튼. 입력값은 `cleanNickname`으로 검사하고, 통과하지 못하면 "닉네임은 2~10자로 정해 주세요."를 입력 칸 아래에 보여 준다. 입력 칸의 `maxlength`는 넉넉히 두고 검사는 `cleanNickname`이 한다. `ranking.enabled`가 `false`이면 닉네임 영역 아래에 "지금은 랭킹에 연결할 수 없습니다. 내 기록은 이 브라우저에 저장됩니다."를 보여 준다.
- 화면이 열릴 때, 닉네임이 있고 `ranking.enabled`이며 `uploaded === false`인 기록이 있으면 하나씩 `ranking.submit`으로 올리고, `'ok'`나 `'kept'`이면 `uploaded`를 `true`로 저장한다. 실패해도 화면에는 아무것도 띄우지 않는다. 화면을 떠난 뒤에 끝난 호출이 화면을 건드리지 않아야 한다.
- 닉네임을 바꾸면 저장하고, `uploaded`인 기록이 있으면 그 기록들을 다시 `submit`하여 서버의 닉네임을 고친다.

- [ ] **Step 1: 순수 함수 테스트 작성과 실패 확인**
- [ ] **Step 2: 구현, router의 `challenges` 경로 연결**
- [ ] **Step 3: 브라우저 확인** — 1280×800과 1920×1080 캡처(기록이 없는 상태, 금·은·동과 기록 없음이 섞인 상태: 과제 데이터를 `gardener-replaced:challenges:v1`에 직접 넣어 만든다). 닉네임에 공백만, 1자, 11자, `<b>x</b>`, 이모지를 넣었을 때의 동작. 키보드만으로 카드를 여는 동작. 콘솔 오류 없음.
- [ ] **Step 4: 전체 테스트, 타입 검사, 빌드 통과 확인**
- [ ] **Step 5: 커밋** — `feat: 과제 목록 화면과 닉네임`

---

### Task 8: 과제 화면

**Files:**
- Create: `src/ui/challengeApp.ts`, `src/progress/challengeGuide.ts`
- Modify: `src/ui/router.ts`, `src/ui/guideBubble.ts`, `src/ui/panels.ts`, `src/style.css`
- Test: `tests/progress/challengeGuide.test.ts`, `tests/ui/challengeApp.test.ts`(순수 함수만), 브라우저 확인

**Interfaces:**
- Consumes: `ChallengeRun`, `judge`, `runSeed`, `ChallengeDef`, `createConsole`, `createGreenhouse`, `createPanels`(설명서와 설정), `createGuideBubble`, 과제 저장 함수, `Screen`
- Produces:

```ts
// challengeGuide.ts
export function challengeIntro(def: ChallengeDef): GuideEntry // 제목은 과제 이름, body는 def.brief + 목표·재는 것·등급 기준 문장, example은 '', goal은 goalText(def)

// challengeApp.ts
export const SPEEDS = [1, 4, 16] as const
export interface ResultView { score: string; medal: Medal | null; actions: number; lines: number; delta: string | null; isBest: boolean }
export function resultView(def: ChallengeDef, r: JudgeResult, lines: number, old: ChallengeRecord | undefined): ResultView
// delta: 이전 최고 기록과의 차이. 예: '0.85초 단축', '1.20초 느림', 횟수는 '2번 줄임'. 이전 기록이 없으면 null
export function createChallengeApp(root: HTMLElement, def: ChallengeDef, opts: {
  storage: StorageLike; audio: Audio; ranking: RankingService; now: () => number
  onBack(): void; onRanking(def: ChallengeDef): void // onRanking은 Task 9에서 연결한다
}): Screen
```

**요구 사항(설계 문서 3.4절, 4.2절, 4.3절):**
- 화면 틀은 본편과 같다(왼쪽 `createConsole`, 오른쪽 온실). 위쪽 막대: "과제 목록으로", 과제 번호와 이름, "설명서", "랭킹", "설정".
- 온실 위쪽의 목표 표시: 목표 문장, 진행 상황(`4 / 6`과 진행 막대), 흐른 시간(시뮬레이션 시간, `12.35초` 형식), 금·은·동 기준 기록, 시드가 3개인 과제에서는 지금 보고 있는 배치("배치 1 / 3"). 인트의 말풍선이나 온실의 화분을 가리지 않는 자리에 둔다.
- 실행 전에는 온실이 과제의 처음 상태로 멈춰 있다(`ChallengeRun`이 `ready`). "실행하기"를 누르면 항상 새 `ChallengeRun`을 첫 시드로 만들어 시작한다(멈춘 상태에서 이어 실행하는 경우만 예외: 한 단계 실행으로 멈춰 있고 코드를 고치지 않았다면 `resume()`).
- 매 프레임 `run.advance(dtMs × 배속)`를 부른다. `dtMs`는 250ms로 자른다. 배속 단추(1배, 4배, 16배)는 실행 단추 줄에 있고, 선택된 배속을 표시한다. 배속은 과제를 옮겨도 유지하지 않는다(항상 1배로 시작).
- `greenhouse.render(run.game, run.takeEvents(), dtMs)`로 그린다. 배속이 높을 때 한 프레임에 이벤트가 많이 몰려도 화면이 버벅이지 않아야 한다(16배에서 프레임 시간이 크게 늘면, 한 프레임에 넘기는 이벤트를 마지막 몇십 개로 줄인다).
- 성공하면: 시드가 3개인 과제는 `judge(def, code, [첫 시드 결과])`로 나머지 배치를 실행한다. 모두 성공하면 결과 화면을 연다. 다른 배치에서 실패하면 "다른 배치에서는 목표에 도달하지 못했습니다."와 실패한 까닭(`FAIL_TEXT`)을 보여 주고, "그 배치 보기" 버튼으로 그 시드의 실행을 화면에서 다시 볼 수 있게 한다(이 실행은 기록에 쓰지 않는다).
- 결과 화면(대화 상자): 등급(금·은·동 또는 "등급 없음"), 기록, 드론 동작 횟수, 코드 줄 수, 이전 최고 기록과의 차이, 최고 기록이면 "최고 기록입니다." 표시. 버튼: "다시 도전하기", "랭킹 보기", "과제 목록으로". 대화 상자가 열려 있는 동안 Ctrl+Enter는 실행하지 않고 Esc는 대화 상자를 닫는다. 성공하면 `unlock` 소리, 실패하면 `fail` 소리를 한 번 낸다.
- 최고 기록이면(`isBetter`) 과제 데이터에 `{ score, actions, lines, code, at: now(), uploaded: false }`를 저장한다. 닉네임이 있고 `ranking.enabled`이면 곧바로 `ranking.submit`을 부르고, `'ok'`나 `'kept'`이면 `uploaded: true`로 저장한다. 결과 화면에는 올리는 중("랭킹에 올리는 중입니다."), 올림("랭킹에 올렸습니다."), 실패("랭킹에 올리지 못했습니다. 기록은 이 브라우저에 저장했고 다음에 다시 올립니다."), 닉네임 없음("닉네임을 정하면 랭킹에 올릴 수 있습니다.")을 한 문장으로 보여 준다.
- 실패하면(제한 시간, 오류, 프로그램 종료, 정지) 기록 칸의 머리에 `FAIL_TEXT`의 문장을 보여 준다. 정지는 대화 상자 없이 문장만 보여 준다.
- 편집기의 코드는 `drafts[def.id]`에 저장한다(본편과 같은 1초 지연 저장, 화면을 떠날 때 바로 저장). 초안이 없으면 그 과제의 최고 기록의 코드, 그것도 없으면 `harvest()\n`으로 시작한다.
- 과제를 처음 열면(`seenIntro`에 없음) 인트의 말풍선으로 `challengeIntro(def)`를 보여 주고 `seenIntro`에 넣는다. "안내 다시 보기"로 다시 볼 수 있다. 이를 위해 `GuideBubble`에 `showEntry(entry: GuideEntry)`와 `rememberEntry(entry: GuideEntry)`를 추가한다. 예제가 빈 안내에는 "예제 복사하기" 버튼이 없어야 한다.
- 설명서는 `run.game`(과제의 해금 집합)을 넘겨 열어, 그 과제에서 쓸 수 있는 항목만 보이게 한다. 설정에서는 "처음부터 다시 시작하기"를 과제 화면에서 숨긴다(`createPanels`에 선택 항목 추가). 설정의 소리와 안내 값은 본편 저장 데이터의 설정을 읽어 쓰고, 과제 화면에서 바꾼 값은 본편 저장에 반영하지 않는다(과제 화면을 여는 동안에만 적용).
- `destroy()`는 Task 6의 본편과 같은 수준으로 모든 것을 해제하고, 실행 중이면 멈춘다.

- [ ] **Step 1: 순수 함수 테스트 작성과 실패 확인** — `challengeIntro`(8개 과제 모두 body가 비어 있지 않고 합니다체 문장으로 끝나며 example이 빈 문자열), `resultView`(이전 기록 없음, 단축, 느림, 같음, 횟수 과제).
- [ ] **Step 2: 구현, router의 `challenge` 경로 연결**
- [ ] **Step 3: 브라우저 확인** — 캡처를 작업 폴더에 저장한다. 확인 항목:
  1. 1번 과제를 기준 풀이로 성공 → 결과 화면(캡처). 과제 목록으로 돌아가면 카드에 기록과 등급이 보인다.
  2. 6번 과제를 `tuned` 풀이로 성공 → 세 배치의 합이 기록으로 나온다. 첫 배치의 답을 좌표로 적은 코드 → "다른 배치에서는 …" 안내와 "그 배치 보기"(캡처).
  3. 실패 네 가지의 문장(캡처 1장 이상).
  4. 과제에서 쓸 수 없는 문법의 오류 문구.
  5. 16배속으로 7번 과제를 실행해도 화면이 멈추지 않고, 1배속과 16배속의 기록이 같다.
  6. 실행 중에 "과제 목록으로"를 누르고 다른 과제를 열어도 앞 과제의 실행이 남아 있지 않다. 과제를 다섯 번 드나든 뒤 Ctrl+Enter가 한 번만 실행된다.
  7. 초안이 과제마다 따로 남고, 새로 고친 뒤에도 남는다.
  8. 인트의 설명이 처음 한 번만 자동으로 뜨고, 목표 표시가 화분과 말풍선을 가리지 않는다(1280×800, 1920×1080 캡처).
  9. 본편 저장 데이터가 과제를 하는 동안 바뀌지 않는다(과제 전후의 `gardener-replaced:save:v1` 값을 비교).
  10. 콘솔 오류가 없다.
- [ ] **Step 4: 전체 테스트, 타입 검사, 빌드 통과 확인**
- [ ] **Step 5: 커밋** — `feat: 과제 화면(목표 표시, 배속, 결과, 여러 배치 심사)`

---

### Task 9: 랭킹 화면

**Files:**
- Create: `src/ui/rankingPanel.ts`
- Modify: `src/ui/challengeApp.ts`, `src/ui/challengeList.ts`(카드에서 랭킹으로 가는 길은 만들지 않는다. 필요한 연결만), `src/style.css`
- Test: `tests/ui/rankingPanel.test.ts`(순수 함수만), 브라우저 확인

**Interfaces:**
- Consumes: `RankingService`, `Board`, `ChallengeDef`, `formatScore`, `medalFor`, 과제 저장 함수
- Produces:

```ts
export interface RankRow { rank: number; nickname: string; score: string; medal: Medal | null; mine: boolean }
export function rankRows(def: ChallengeDef, board: Board): RankRow[] // 같은 기록은 같은 순위(1, 1, 3 …)
export function myRankText(board: Board): string | null             // '내 순위 37위' 또는 null
export function createRankingPanel(host: HTMLElement, opts: { audio: Audio; ranking: RankingService }): {
  open(def: ChallengeDef, local: ChallengeRecord | undefined, nickname: string | null, opener?: HTMLElement | null): void
  close(): void
  isOpen(): boolean
  destroy(): void
}
```

**요구 사항(설계 문서 7.1절):**
- 대화 상자 형태(기존 panel의 틀과 초점 처리 방식을 따른다: 열면 안으로 초점 이동, 닫으면 연 버튼으로 초점 복귀, Esc로 닫기, 바깥은 `inert`).
- 내용: 과제 이름, 상위 20명의 표(순위, 닉네임, 기록, 등급), 내 줄 강조, 표 아래에 내 순위와 내 기록. 내 기록이 20위 밖이면 표 아래의 문장으로만 보여 준다.
- 상태별 표시: 불러오는 중("랭킹을 불러오는 중입니다."), 닿지 않음 또는 `enabled === false`("지금은 랭킹에 연결할 수 없습니다. 내 기록은 이 브라우저에 저장됩니다."와 이 브라우저의 내 기록), 기록이 하나도 없음("아직 기록이 없습니다. 첫 기록을 남겨 보세요."), 닉네임 없음(표는 보여 주고 "닉네임을 정하면 랭킹에 올릴 수 있습니다."와 과제 목록으로 가는 안내).
- 닫힌 뒤에 도착한 응답은 화면을 건드리지 않는다. 연 직후 다른 과제의 랭킹을 다시 열면 앞의 응답이 뒤의 화면을 덮지 않는다.
- 닉네임과 기록은 `textContent`로 넣는다.
- 과제 화면의 "랭킹" 버튼과 결과 화면의 "랭킹 보기"가 이 화면을 연다. 결과 화면에서 열 때에는 올리기가 끝난 뒤의 랭킹이 보이도록, 올리는 중이면 끝나기를 기다린 뒤 불러온다.

- [ ] **Step 1: 순수 함수 테스트 작성과 실패 확인** — `rankRows`의 동점 순위(1, 1, 3), 내 줄 표시, 빈 목록; `myRankText`.
- [ ] **Step 2: 구현과 연결**
- [ ] **Step 3: 브라우저 확인** — 실제 서버가 아직 없으므로, 개발 서버에서만 쓰는 가짜 `RankingService`를 `window`에 주입하지 않고 **Firestore 에뮬레이터**에 연결하여 확인한다: `firebaseConfig.ts`를 건드리지 않고, 확인용으로만 쓰는 URL 해시 `#emu`가 있고 `import.meta.env.DEV`일 때에만 `demo-autofarm` 프로젝트와 에뮬레이터(Auth, Firestore)에 연결하는 분기를 `src/online/index.ts`에 둔다(배포 빌드에는 들어가지 않아야 하며, 빌드한 js에 `demo-autofarm` 문자열이 없는지 확인한다). 확인 항목:
  1. 닉네임을 정하고 1번 과제를 성공 → "랭킹에 올렸습니다." → 랭킹에 내 줄이 강조되어 보인다(캡처).
  2. 다른 프로필(다른 `--user-data-dir`)로 두 사람의 기록을 더 올려 순위와 동점 표시가 맞는지 본다.
  3. 더 나쁜 기록으로 성공하면 서버 기록이 바뀌지 않는다.
  4. 에뮬레이터를 끈 상태에서 성공 → "랭킹에 올리지 못했습니다. …" 문장이 나오고 화면이 멈추지 않는다. 에뮬레이터를 다시 켜고 과제 목록을 열면 기록이 올라간다.
  5. `#emu` 없이(설정값 `null`) 열면 랭킹 화면이 "지금은 랭킹에 연결할 수 없습니다. …"와 내 기록을 보여 준다(캡처).
  6. 닉네임 `<b>x</b>`가 글자 그대로 보인다.
  7. 결과 화면의 버튼을 빠르게 두 번 눌러도 문서가 한 번만 쓰인다.
- [ ] **Step 4: 전체 테스트, 타입 검사, 빌드, 규칙 테스트 통과 확인**
- [ ] **Step 5: 커밋** — `feat: 랭킹 화면`

---

### Task 10: 문서 정리와 전체 확인

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-12-challenges-ranking-design.md`(구현과 달라진 곳), `tests/ui/title.test.ts`(필요하면)
- Test: 전체

- [ ] **Step 1: README 갱신** — 게임 소개에 시작 화면과 도전 과제를 추가하고, 폴더 구조 표에 `src/online`을 추가하며, 저장 키 설명에 `gardener-replaced:challenges:v1`을 추가한다. 과제를 추가하거나 수치를 바꿀 때 해야 할 일(판 번호 올리기, 기준 풀이, `firestore.rules`의 하한 표, 규칙 배포)을 절로 정리한다. 완성된 한국어 문장으로 쓴다.
- [ ] **Step 2: 설계 문서와 구현의 차이 정리** — 구현하면서 달라진 점이 있으면 설계 문서를 고친다.
- [ ] **Step 3: 이전 판 저장 호환 확인** — 커밋 `b9b4680`(이전에 배포한 판)의 코드로 만든 저장 JSON을 새 코드의 `deserialize`가 그대로 받아들이고 다시 `serialize`한 결과가 같은지 확인하는 테스트를 `tests/progress/saveCompat.test.ts`에 추가한다(저장 JSON은 그 커밋의 코드로 실제로 만들어 테스트 파일에 고정 값으로 넣는다. 해금 12개, 4×4 선반 상태).
- [ ] **Step 4: 단일 파일 빌드 확인** — 상위 폴더에서 `node tools/build-artifact.mjs gardener-replaced "오토팜 스테이션" <임시 출력 파일>`이 성공하고, 그 파일을 화면 없는 Chrome에서 `file://`로 열어 시작 화면 → 과제 1번 성공 → 랭킹 화면("연결할 수 없습니다" 문장)까지 콘솔 오류 없이 되는지 확인한다. 파일 크기를 보고서에 적는다.
- [ ] **Step 5: 전체 확인** — `npm test && npx tsc --noEmit && npm run build && npm run test:rules`
- [ ] **Step 6: 커밋** — `docs: 시작 화면, 도전 과제, 랭킹에 관한 문서 정리`

---

## 계획 밖의 일(구현이 끝난 뒤 사용자와 함께 한다)

- Firebase 설정값을 `src/online/firebaseConfig.ts`에 넣고, 규칙과 색인을 실제 프로젝트에 배포한다.
- GitHub 저장소에 올리고 GitHub Pages를 켠다. 코드모스 게시물의 링크를 바꾼다.
- 아티팩트를 새 빌드로 갱신한다.
