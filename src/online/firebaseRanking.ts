import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import {
  collection, connectFirestoreEmulator, doc, getCount, getDoc, getDocs, getFirestore, limit, orderBy,
  query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore/lite'
import type { FirebaseConfig } from './firebaseConfig'
import { CALL_TIMEOUT_MS, withTimeout } from './ranking'
import type { Board, RankingService, Submission, SubmitResult } from './ranking'

export interface EmulatorOptions { firestore: [host: string, port: number]; auth: string }

// 익명 계정은 브라우저에 앱 이름으로 저장된다. 이름이 열 때마다 달라지면 페이지를 다시 열 때마다 다른 사람이 되어
// 내 기록이 랭킹에 여러 줄로 쌓이므로 이름을 고정한다.
export const DEFAULT_APP_NAME = 'ranking'
const TOP_COUNT = 20
const BOARD_CACHE_MS = 60_000
const TIMED_OUT = Symbol('timed out')

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const sameContent = (a: Submission, b: Submission): boolean =>
  a.score === b.score && a.nickname === b.nickname && a.actions === b.actions && a.lines === b.lines && a.code === b.code

// 설정값과 (테스트용) 에뮬레이터 연결 정보로 Firebase 구현을 만든다. 점수는 작을수록 좋다.
export function createFirebaseRanking(
  config: FirebaseConfig,
  options: { emulator?: EmulatorOptions; now?: () => number; appName?: string } = {},
): RankingService {
  // appName은 한 프로세스에서 여러 사용자를 만드는 테스트가 쓴다.
  // 같은 이름의 앱이 이미 있으면(개발 서버가 모듈을 다시 평가한 경우) 그것을 다시 쓴다. 에뮬레이터 연결은 앱을 처음 만들 때에만 한다.
  const name = options.appName ?? DEFAULT_APP_NAME
  const existing = getApps().find(a => a.name === name)
  const app = existing ?? initializeApp(config, name)
  const auth = getAuth(app)
  const db = getFirestore(app)
  if (options.emulator && !existing) {
    connectAuthEmulator(auth, options.emulator.auth, { disableWarnings: true })
    connectFirestoreEmulator(db, options.emulator.firestore[0], options.emulator.firestore[1])
  }
  const now = options.now ?? Date.now

  // 서버 호출 하나. 거부되거나 늦으면 예외로 바꿔 아래 try/catch에서 한 번에 처리한다.
  async function call<T>(p: Promise<T>): Promise<T> {
    const r = await withTimeout<T | typeof TIMED_OUT>(p, CALL_TIMEOUT_MS, TIMED_OUT)
    if (r === TIMED_OUT) throw new Error('timeout')
    return r
  }

  let signIn: Promise<string> | null = null
  function uid(): Promise<string> {
    signIn ??= call(signInAnonymously(auth)).then(c => c.user.uid)
    signIn.catch(() => { signIn = null }) // 실패하면 다음 호출에서 다시 시도한다
    return signIn
  }

  const scoreRef = (challengeId: string, id: string) => doc(db, 'challenges', challengeId, 'scores', id)
  const cache = new Map<string, { at: number; board: Board }>()
  // 과제별로 진행 중인(또는 그 뒤에 줄을 선) 마지막 올리기
  const pending = new Map<string, { s: Submission; p: Promise<SubmitResult> }>()
  const boardPending = new Map<string, Promise<Board | null>>()
  // 과제별 세대 번호. 캐시를 지울 때 올리며, board가 읽는 동안 번호가 바뀌었으면 그 결과는 캐시에 넣지 않는다.
  const generation = new Map<string, number>()
  const gen = (challengeId: string) => generation.get(challengeId) ?? 0
  const clearCache = (challengeId: string) => {
    cache.delete(challengeId)
    generation.set(challengeId, gen(challengeId) + 1)
  }

  // 닉네임을 바꿀 때에는 nickAt(닉네임을 마지막으로 정한 서버 시각)을 함께 쓴다. 닉네임이 그대로이면 nickAt을 건드리지 않는다.
  // 규칙은 nickAt에서 60초가 넘게 지나야 닉네임을 바꾸게 해 주므로, 그보다 이르면 닉네임을 바꾸는 쓰기는 거부된다.
  async function doSubmit(s: Submission): Promise<SubmitResult> {
    try {
      const me = await uid()
      const ref = scoreRef(s.challengeId, me)
      const codeRef = doc(ref, 'private', 'code')
      const snap = await call(getDoc(ref))
      const data = snap.exists() ? snap.data() : null
      // 서버의 값이 이상한 모양이면 기록이 없는 것으로 본다(덮어쓸 수 있으면 덮어쓴다).
      const old = data && typeof data.nickname === 'string' && isFiniteNumber(data.score)
        ? { nickname: data.nickname, score: data.score } : null
      const record = { score: s.score, actions: s.actions, lines: s.lines, at: serverTimestamp() }
      const rename = { nickname: s.nickname, nickAt: serverTimestamp() }
      if (!old) {
        const batch = writeBatch(db)
        batch.set(ref, { ...record, ...rename })
        batch.set(codeRef, { code: s.code })
        await call(batch.commit())
        clearCache(s.challengeId)
        return 'ok'
      }
      if (s.score < old.score) {
        // 기록과 코드는 한 묶음으로 쓴다. 규칙이 코드 문서를 점수 문서가 바뀌는 요청에서만 받는다.
        const commit = (fields: Record<string, unknown>): Promise<void> => {
          const batch = writeBatch(db)
          batch.update(ref, fields)
          batch.set(codeRef, { code: s.code })
          return call(batch.commit())
        }
        if (old.nickname === s.nickname) {
          await commit(record)
          clearCache(s.challengeId)
          return 'ok'
        }
        try {
          await commit({ ...record, ...rename })
          clearCache(s.challengeId)
          return 'ok'
        } catch {
          // 닉네임을 바꾼 지 60초가 지나지 않았을 수 있다. 그 때문에 기록까지 올라가지 못하는 일이 없도록 기록만 서버의 닉네임으로 올린다.
          // 닉네임을 고치지 못했으므로 failed를 돌려주어 다시 올리게 한다. 그때에는 기록이 같으므로 닉네임만 고친다.
          await commit(record)
          clearCache(s.challengeId)
          return 'failed'
        }
      }
      if (old.nickname !== s.nickname) {
        await call(updateDoc(ref, rename))
        clearCache(s.challengeId)
      }
      return 'kept'
    } catch {
      return 'failed'
    }
  }

  async function doBoard(challengeId: string): Promise<Board | null> {
    try {
      const me = await uid()
      const scores = collection(db, 'challenges', challengeId, 'scores')
      const top = await call(getDocs(query(scores, orderBy('score'), orderBy('at'), limit(TOP_COUNT))))
      const mine = await call(getDoc(scoreRef(challengeId, me)))
      const myScore = mine.exists() && isFiniteNumber(mine.data().score) ? (mine.data().score as number) : null
      let myRank: number | null = null
      if (myScore !== null) {
        const better = await call(getCount(query(scores, where('score', '<', myScore))))
        myRank = better.data().count + 1
      }
      const entries: Board['top'] = []
      for (const d of top.docs) {
        const { nickname, score } = d.data()
        if (typeof nickname === 'string' && isFiniteNumber(score)) entries.push({ nickname, score, mine: d.id === me })
      }
      return { top: entries, myRank, myScore }
    } catch {
      return null
    }
  }

  return {
    enabled: true,
    submit(s) {
      const running = pending.get(s.challengeId)
      // 진행 중인 올리기와 내용이 모두 같으면 그 결과를 함께 쓴다. 하나라도 다르면 앞선 올리기가 끝난 뒤에 이어서 올린다.
      // 앞선 결과를 그대로 돌려주면, 올리는 중에 세운 더 좋은 기록이 서버에 가지 않았는데 올린 것으로 보이게 된다.
      if (running && sameContent(running.s, s)) return running.p
      const p: Promise<SubmitResult> = (running ? running.p.then(() => doSubmit(s)) : doSubmit(s)).finally(() => {
        if (pending.get(s.challengeId)?.p === p) pending.delete(s.challengeId)
      })
      pending.set(s.challengeId, { s, p })
      return p
    },
    board(challengeId) {
      const hit = cache.get(challengeId)
      if (hit && now() - hit.at < BOARD_CACHE_MS) return Promise.resolve(hit.board)
      const running = boardPending.get(challengeId)
      if (running) return running
      const startGen = gen(challengeId)
      const p = doBoard(challengeId).then(board => {
        if (board && gen(challengeId) === startGen) cache.set(challengeId, { at: now(), board })
        return board
      }).finally(() => boardPending.delete(challengeId))
      boardPending.set(challengeId, p)
      return p
    },
  }
}
