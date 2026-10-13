import { deleteApp, getApp } from 'firebase/app'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, collectionGroup, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFirebaseRanking, DEFAULT_APP_NAME } from '../src/online/firebaseRanking'
import type { Submission } from '../src/online/ranking'

// 에뮬레이터(Firestore 8790, Auth 9099)에 실제로 연결해 Firebase 구현을 확인한다.
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8790'
const [fsHost, fsPort] = HOST.split(':')
const CONFIG = { apiKey: 'fake-key', authDomain: 'demo-autofarm.firebaseapp.com', projectId: 'demo-autofarm', appId: 'fake-app' }
const CID = 'c01-first-v1'
const FLOOR = 8000

// 앱 이름마다 따로 로그인하므로 서비스를 하나 만들 때마다 다른 uid가 된다.
let clock = 0
let users = 0
const newUser = () => createFirebaseRanking(CONFIG, {
  emulator: { firestore: [fsHost, Number(fsPort)], auth: 'http://127.0.0.1:9099' },
  now: () => clock,
  appName: `user-${++users}`,
})
const sub = (over: Partial<Submission> = {}): Submission => ({
  challengeId: CID, nickname: '농부', score: FLOOR + 1000, actions: 10, lines: 5, code: 'print(1)', ...over,
})
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

beforeEach(async () => {
  clock = 0
  const res = await fetch(`http://${HOST}/emulator/v1/projects/demo-autofarm/databases/(default)/documents`, { method: 'DELETE' })
  expect(res.ok).toBe(true)
})

const EMULATOR = { firestore: [fsHost, Number(fsPort)] as [string, number], auth: 'http://127.0.0.1:9099' }

// 규칙을 건너뛰고 센 점수 문서의 수
async function scoreCount(): Promise<number> {
  const env = await initializeTestEnvironment({ projectId: 'demo-autofarm', firestore: { host: fsHost, port: Number(fsPort) } })
  let count = -1
  await env.withSecurityRulesDisabled(async ctx => { count = (await getDocs(collection(ctx.firestore(), 'challenges', CID, 'scores'))).size })
  return count
}

// 규칙을 건너뛰고 Firestore를 다룬다.
async function admin(fn: (db: ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']) => Promise<void>) {
  const env = await initializeTestEnvironment({ projectId: 'demo-autofarm', firestore: { host: fsHost, port: Number(fsPort) } })
  await env.withSecurityRulesDisabled(async ctx => { await fn(ctx.firestore() as never) })
  await env.cleanup()
}
type Db = Parameters<Parameters<typeof admin>[0]>[0]
const scoreDocs = async (db: Db) => (await getDocs(collection(db, 'challenges', CID, 'scores'))).docs
// 닉네임을 정한 지 60초가 넘은 상태를 만든다. 서버 시각을 앞당길 수 없으므로 nickAt을 2분 전으로 돌려놓는다.
const ageNickname = () => admin(async db => {
  for (const d of await scoreDocs(db)) await updateDoc(d.ref, { nickAt: new Date(Date.now() - 120_000) })
})
async function serverDoc(): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> = {}
  await admin(async db => { data = (await scoreDocs(db))[0].data() })
  return data
}
async function serverCodes(): Promise<unknown[]> {
  let codes: unknown[] = []
  await admin(async db => { codes = (await getDocs(collectionGroup(db, 'private'))).docs.map(d => d.data()) })
  return codes
}

describe('Firebase 앱 이름', () => {
  it('기본 앱 이름은 고정된 값이다', () => {
    expect(DEFAULT_APP_NAME).toBe('ranking')
    createFirebaseRanking(CONFIG, { emulator: EMULATOR })
    expect(getApp(DEFAULT_APP_NAME).name).toBe('ranking')
  })

  it('같은 이름으로 서비스를 다시 만들면 앱을 다시 쓰고 같은 계정이다', async () => {
    const first = createFirebaseRanking(CONFIG, { emulator: EMULATOR, appName: 'same-name' })
    expect(await first.submit(sub())).toBe('ok')
    const second = createFirebaseRanking(CONFIG, { emulator: EMULATOR, appName: 'same-name' })
    expect(second.enabled).toBe(true)
    expect(await second.board(CID)).toEqual({ top: [{ nickname: '농부', score: FLOOR + 1000, mine: true }], myRank: 1, myScore: FLOOR + 1000 })
    expect(await second.submit(sub({ score: FLOOR + 50 }))).toBe('ok')
    expect(await scoreCount()).toBe(1)
  })

  // 페이지를 다시 여는 경우를 흉내 낸다. 계정은 앱 이름으로 저장되므로, 앱을 지우고 같은 이름으로 다시 만들면 같은 계정이어야 한다.
  // Node에서는 계정이 프로세스의 메모리에 저장되어 앱을 지워도 남는다(브라우저에서는 IndexedDB에 남는다).
  it('앱을 지우고 같은 이름으로 다시 만들어도 같은 계정이고 문서는 하나이다', async () => {
    const first = createFirebaseRanking(CONFIG, { emulator: EMULATOR, appName: 'reopened' })
    expect(await first.submit(sub())).toBe('ok')
    await deleteApp(getApp('reopened'))
    const second = createFirebaseRanking(CONFIG, { emulator: EMULATOR, appName: 'reopened' })
    expect(await second.board(CID)).toEqual({ top: [{ nickname: '농부', score: FLOOR + 1000, mine: true }], myRank: 1, myScore: FLOOR + 1000 })
    expect(await second.submit(sub({ score: FLOOR + 50 }))).toBe('ok')
    expect(await scoreCount()).toBe(1)
  })

  it('이름이 다르면 다른 계정이다', async () => {
    const first = createFirebaseRanking(CONFIG, { emulator: EMULATOR, appName: 'name-a' })
    expect(await first.submit(sub())).toBe('ok')
    const other = createFirebaseRanking(CONFIG, { emulator: EMULATOR, appName: 'name-b' })
    expect((await other.board(CID))?.top).toEqual([{ nickname: '농부', score: FLOOR + 1000, mine: false }])
  })
})

describe('Firebase 랭킹 구현(에뮬레이터)', () => {
  it('새 기록은 ok이고 순위판에 내 기록이 mine으로 나온다', async () => {
    const a = newUser()
    expect(a.enabled).toBe(true)
    expect(await a.submit(sub())).toBe('ok')
    const board = await a.board(CID)
    expect(board).toEqual({ top: [{ nickname: '농부', score: FLOOR + 1000, mine: true }], myRank: 1, myScore: FLOOR + 1000 })
  })

  it('더 나쁜 기록과 같은 기록은 kept이고 점수는 그대로이다', async () => {
    const a = newUser()
    expect(await a.submit(sub())).toBe('ok')
    expect(await a.submit(sub({ score: FLOOR + 2000 }))).toBe('kept')
    expect(await a.submit(sub())).toBe('kept')
    clock += 61_000
    expect((await a.board(CID))?.myScore).toBe(FLOOR + 1000)
  })

  it('더 좋은 기록은 ok로 덮어쓴다', async () => {
    const a = newUser()
    await a.submit(sub())
    expect(await a.submit(sub({ score: FLOOR + 50 }))).toBe('ok')
    expect((await a.board(CID))?.myScore).toBe(FLOOR + 50)
  })

  it('닉네임만 바뀐 경우 kept이면서 닉네임이 갱신된다(닉네임을 정한 지 60초가 넘었을 때)', async () => {
    const a = newUser()
    await a.submit(sub())
    await ageNickname()
    const before = await serverDoc()
    expect(await a.submit(sub({ nickname: '새이름', score: FLOOR + 5000 }))).toBe('kept')
    const board = await a.board(CID)
    expect(board?.top[0]).toEqual({ nickname: '새이름', score: FLOOR + 1000, mine: true })
    const after = await serverDoc()
    expect(after.at).toEqual(before.at)
    expect(after.nickAt).not.toEqual(before.nickAt)
  })

  it('새 기록에는 nickAt이 at과 같은 서버 시각으로 들어간다', async () => {
    const a = newUser()
    await a.submit(sub())
    const data = await serverDoc()
    expect(Object.keys(data).sort()).toEqual(['actions', 'at', 'lines', 'nickAt', 'nickname', 'score'])
    expect(data.nickAt).toEqual(data.at)
  })

  it('닉네임이 그대로이면 더 좋은 기록을 올려도 nickAt은 그대로이다', async () => {
    const a = newUser()
    await a.submit(sub())
    const before = await serverDoc()
    await sleep(20)
    expect(await a.submit(sub({ score: FLOOR + 50, code: 'fast()' }))).toBe('ok')
    const after = await serverDoc()
    expect(after.score).toBe(FLOOR + 50)
    expect(after.nickAt).toEqual(before.nickAt)
    expect(after.at).not.toEqual(before.at)
    expect(await serverCodes()).toEqual([{ code: 'fast()' }])
  })

  it('닉네임을 정한 직후에 바꾸면 failed이고, 60초가 지난 뒤에 다시 올리면 고쳐진다', async () => {
    const a = newUser()
    await a.submit(sub())
    expect(await a.submit(sub({ nickname: '새이름' }))).toBe('failed')
    expect((await serverDoc()).nickname).toBe('농부')
    await ageNickname()
    expect(await a.submit(sub({ nickname: '새이름' }))).toBe('kept')
    expect((await serverDoc()).nickname).toBe('새이름')
  })

  it('더 좋은 기록을 올리면서 닉네임 변경이 60초 제한에 걸리면 기록만 옛 닉네임으로 올라가고 failed이다', async () => {
    const a = newUser()
    await a.submit(sub({ code: 'slow()' }))
    expect((await a.board(CID))?.myScore).toBe(FLOOR + 1000)
    const better = sub({ nickname: '새이름', score: FLOOR + 50, code: 'fast()' })
    expect(await a.submit(better)).toBe('failed')
    // 기록과 코드는 서버에 반영되었고 순위판의 캐시도 지워졌다.
    expect((await a.board(CID))?.top[0]).toEqual({ nickname: '농부', score: FLOOR + 50, mine: true })
    expect(await serverCodes()).toEqual([{ code: 'fast()' }])
    // 다시 올리면 기록은 이미 같으므로 닉네임만 고친다. 60초가 지나기 전에는 여전히 failed이다.
    expect(await a.submit(better)).toBe('failed')
    await ageNickname()
    expect(await a.submit(better)).toBe('kept')
    expect((await a.board(CID))?.top[0]).toEqual({ nickname: '새이름', score: FLOOR + 50, mine: true })
  })

  it('닉네임을 정한 지 60초가 넘었으면 더 좋은 기록과 닉네임을 함께 올린다', async () => {
    const a = newUser()
    await a.submit(sub())
    await ageNickname()
    expect(await a.submit(sub({ nickname: '새이름', score: FLOOR + 50, code: 'fast()' }))).toBe('ok')
    expect((await a.board(CID))?.top[0]).toEqual({ nickname: '새이름', score: FLOOR + 50, mine: true })
    expect(await serverCodes()).toEqual([{ code: 'fast()' }])
  })

  it('상위 목록은 점수 오름차순, 같으면 먼저 올린 사람이 위이고 mine이 표시된다', async () => {
    const [a, b, c] = [newUser(), newUser(), newUser()]
    await a.submit(sub({ nickname: '에이', score: FLOOR + 300 }))
    await sleep(30)
    await b.submit(sub({ nickname: '비이', score: FLOOR + 100 }))
    await sleep(30)
    await c.submit(sub({ nickname: '씨이', score: FLOOR + 300 }))
    const board = await c.board(CID)
    expect(board?.top.map(e => [e.nickname, e.mine])).toEqual([['비이', false], ['에이', false], ['씨이', true]])
  })

  it('myRank는 나보다 좋은 기록의 수 + 1이고 동점은 같은 순위이다', async () => {
    const [a, b, c] = [newUser(), newUser(), newUser()]
    await a.submit(sub({ nickname: '에이', score: FLOOR + 100 }))
    await b.submit(sub({ nickname: '비이', score: FLOOR + 300 }))
    await c.submit(sub({ nickname: '씨이', score: FLOOR + 300 }))
    expect((await a.board(CID))?.myRank).toBe(1)
    expect((await b.board(CID))?.myRank).toBe(2)
    expect((await c.board(CID))?.myRank).toBe(2)
  })

  it('기록이 없는 사용자는 myRank와 myScore가 null이다', async () => {
    const a = newUser()
    await a.submit(sub())
    const board = await newUser().board(CID)
    expect(board?.myRank).toBeNull()
    expect(board?.myScore).toBeNull()
    expect(board?.top).toHaveLength(1)
  })

  it('같은 과제를 동시에 두 번 submit하면 같은 Promise이고 쓰기는 한 번이다', async () => {
    const a = newUser()
    const p1 = a.submit(sub())
    const p2 = a.submit(sub())
    expect(p2).toBe(p1)
    expect(await Promise.all([p1, p2])).toEqual(['ok', 'ok'])
    // 끝난 뒤의 다음 submit은 새로 처리되어 kept가 된다(진행 중 기록이 남지 않는다)
    expect(await a.submit(sub())).toBe('kept')
  })

  it('진행 중에 더 좋은 점수로 다시 부르면 두 번째도 서버에 반영된다', async () => {
    const a = newUser()
    const p1 = a.submit(sub({ score: FLOOR + 1000, code: 'slow()' }))
    const p2 = a.submit(sub({ score: FLOOR + 50, code: 'fast()' }))
    expect(p2).not.toBe(p1)
    expect(await Promise.all([p1, p2])).toEqual(['ok', 'ok'])
    expect((await a.board(CID))?.myScore).toBe(FLOOR + 50)
    const env = await initializeTestEnvironment({ projectId: 'demo-autofarm', firestore: { host: fsHost, port: Number(fsPort) } })
    await env.withSecurityRulesDisabled(async ctx => {
      const snap = await getDocs(collectionGroup(ctx.firestore(), 'private'))
      expect(snap.docs.map(d => d.data())).toEqual([{ code: 'fast()' }])
    })
    await env.cleanup()
  })

  it('진행 중에 내용이 다른 올리기가 여럿 오면 온 순서대로 이어서 올린다', async () => {
    const a = newUser()
    const results = await Promise.all([
      a.submit(sub({ score: FLOOR + 1000 })),
      a.submit(sub({ score: FLOOR + 500 })),
      a.submit(sub({ score: FLOOR + 800 })),
    ])
    expect(results).toEqual(['ok', 'ok', 'kept'])
    expect((await a.board(CID))?.myScore).toBe(FLOOR + 500)
    // 끝난 뒤에는 진행 중 기록이 남지 않는다
    expect(await a.submit(sub({ score: FLOOR + 500 }))).toBe('kept')
  })

  it('진행 중에 닉네임만 다른 내용으로 다시 부르면 앞선 올리기가 끝난 뒤에 따로 처리된다', async () => {
    const a = newUser()
    const results = await Promise.all([a.submit(sub()), a.submit(sub({ nickname: '새이름' }))])
    // 두 번째는 닉네임만 고치는 쓰기이고, 방금 정한 닉네임이라 60초 제한에 걸린다.
    expect(results).toEqual(['ok', 'failed'])
    expect((await a.board(CID))?.top[0].nickname).toBe('농부')
  })

  it('board는 60초 동안 캐시되고 submit ok가 캐시를 지운다', async () => {
    const a = newUser()
    await a.submit(sub())
    const first = await a.board(CID)
    await newUser().submit(sub({ nickname: '다른이', score: FLOOR + 50 }))
    expect(await a.board(CID)).toBe(first) // 캐시
    clock = 61_000
    expect((await a.board(CID))?.top).toHaveLength(2) // 만료
    clock = 62_000
    const cached = await a.board(CID)
    await a.submit(sub({ score: FLOOR + 100 }))
    expect(await a.board(CID)).not.toBe(cached) // submit ok로 무효화
  })

  it('제출한 코드는 private/code에 저장된다', async () => {
    const a = newUser()
    await a.submit(sub({ code: 'move()' }))
    // 규칙을 건너뛰고 private 문서를 모두 읽는다
    const env = await initializeTestEnvironment({ projectId: 'demo-autofarm', firestore: { host: fsHost, port: Number(fsPort) } })
    await env.withSecurityRulesDisabled(async ctx => {
      const snap = await getDocs(collectionGroup(ctx.firestore(), 'private'))
      expect(snap.docs.map(d => d.data())).toEqual([{ code: 'move()' }])
    })
    await env.cleanup()
  })
})

describe('읽기 값 검증과 캐시 경쟁', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  // 규칙을 건너뛰고 문서를 넣는다.
  async function inject(fn: (db: ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']) => Promise<void>) {
    const env = await initializeTestEnvironment({ projectId: 'demo-autofarm', firestore: { host: fsHost, port: Number(fsPort) } })
    await env.withSecurityRulesDisabled(async ctx => { await fn(ctx.firestore() as never) })
    await env.cleanup()
  }
  const junk = (id: string, over: Record<string, unknown>) => (db: Parameters<Parameters<typeof inject>[0]>[0]) =>
    setDoc(doc(db, 'challenges', CID, 'scores', id), { nickname: '정상', score: FLOOR + 50, actions: 1, lines: 1, at: new Date(2026, 0, 1), ...over })

  it('이상한 모양의 문서는 상위 목록에서 빠지고 board는 null이 아니다', async () => {
    const a = newUser()
    await a.submit(sub({ nickname: '진짜', score: FLOOR + 900 }))
    await inject(async db => {
      await junk('j1', { nickname: 5, score: FLOOR + 50 })(db)
      await junk('j2', { score: 'abc' })(db)
      await junk('j3', { score: Number.POSITIVE_INFINITY })(db)
      await junk('j4', { nickname: '정상이', score: FLOOR + 20 })(db)
    })
    const board = await a.board(CID)
    expect(board).not.toBeNull()
    expect(board?.top.map(e => e.nickname).sort()).toEqual(['정상이', '진짜'].sort())
  })

  it('내 문서의 score가 이상하면 myScore와 myRank는 null이다', async () => {
    const a = newUser()
    await a.submit(sub())
    await inject(async db => {
      const snap = await getDocs(collection(db, 'challenges', CID, 'scores'))
      await setDoc(snap.docs[0].ref, { nickname: '농부', score: 'abc', actions: 1, lines: 1, at: new Date(2026, 0, 1) })
    })
    clock = 100_000
    const board = await a.board(CID)
    expect(board).not.toBeNull()
    expect(board?.myScore).toBeNull()
    expect(board?.myRank).toBeNull()
  })

  it('kept로 닉네임을 고치면 board 캐시가 지워진다', async () => {
    const a = newUser()
    await a.submit(sub())
    expect((await a.board(CID))?.top[0].nickname).toBe('농부')
    await ageNickname()
    expect(await a.submit(sub({ nickname: '새이름', score: FLOOR + 5000 }))).toBe('kept')
    expect((await a.board(CID))?.top[0].nickname).toBe('새이름')
  })

  it('board가 읽는 도중 submit이 성공하면 이전 결과를 캐시에 넣지 않는다', async () => {
    const a = newUser()
    await a.board('c02-row-v1') // 로그인을 미리 해 둔다
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await realFetch(input, init)
      if (String(input).includes(':runQuery')) await sleep(400) // 상위 목록 응답을 늦춘다(옛 결과)
      return res
    }) as typeof fetch
    const stale = a.board(CID)
    await sleep(100)
    expect(await a.submit(sub())).toBe('ok')
    await stale
    globalThis.fetch = realFetch
    const fresh = await a.board(CID)
    expect(fresh?.top.map(e => e.nickname)).toEqual(['농부'])
  })

  it('같은 과제의 board가 진행 중이면 같은 Promise를 돌려주고 읽기는 한 번이다', async () => {
    const a = newUser()
    await a.board('c02-row-v1')
    let queries = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes(':runQuery')) queries++
      return realFetch(input, init)
    }) as typeof fetch
    const p1 = a.board(CID)
    const p2 = a.board(CID)
    expect(p2).toBe(p1)
    await Promise.all([p1, p2])
    expect(queries).toBe(1)
  })
})
