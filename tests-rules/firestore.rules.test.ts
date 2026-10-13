import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const CID = 'c01-first-v1'
const FLOOR = 8000
let env: RulesTestEnvironment

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8790').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-autofarm',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
})
afterAll(async () => { await env.cleanup() })
beforeEach(async () => { await env.clearFirestore() })

const body = (over: Record<string, unknown> = {}) => ({
  nickname: '농부', score: FLOOR + 500, actions: 10, lines: 5, at: serverTimestamp(), nickAt: serverTimestamp(), ...over,
})
const alice = () => env.authenticatedContext('alice').firestore()
const aliceDoc = (db = alice(), cid = CID) => doc(db, 'challenges', cid, 'scores', 'alice')
const codeDoc = (db = alice()) => doc(db, 'challenges', CID, 'scores', 'alice', 'private', 'code')
const OLD = new Date(2026, 0, 1)

// 이미 기록이 있는 상태를 규칙을 건너뛰고 만든다. 닉네임은 오래전에 정한 것으로 둔다.
async function seed(score = FLOOR + 500) {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'challenges', CID, 'scores', 'alice'), {
      nickname: '농부', score, actions: 10, lines: 5, at: OLD, nickAt: OLD,
    })
  })
}
// 규칙을 건너뛰고 점수 문서의 일부를 고친다.
async function patch(data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), 'challenges', CID, 'scores', 'alice'), data)
  })
}
// 규칙을 건너뛰고 제출 코드 문서를 만든다.
async function seedCode(code = 'print(1)') {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'challenges', CID, 'scores', 'alice', 'private', 'code'), { code })
  })
}
// 더 좋은 기록으로 바꾸는 갱신. 클라이언트처럼 닉네임과 nickAt은 건드리지 않는다.
const better = (over: Record<string, unknown> = {}) => ({ score: FLOOR + 100, actions: 9, lines: 4, at: serverTimestamp(), ...over })
const rename = (nickname = '새이름') => ({ nickname, nickAt: serverTimestamp() })
// 점수 문서와 제출 코드를 한 묶음으로 쓴다(클라이언트가 실제로 하는 쓰기).
function createWithCode(code: Record<string, unknown>, score: Record<string, unknown> = body()) {
  const db = alice()
  const batch = writeBatch(db)
  batch.set(aliceDoc(db), score)
  batch.set(codeDoc(db), code)
  return batch.commit()
}
function updateWithCode(code: Record<string, unknown>, score: Record<string, unknown>) {
  const db = alice()
  const batch = writeBatch(db)
  batch.update(aliceDoc(db), score)
  batch.set(codeDoc(db), code)
  return batch.commit()
}

describe('scores 생성', () => {
  it('본인 생성 성공', async () => { await assertSucceeds(setDoc(aliceDoc(), body())) })
  it('하한과 같은 score 성공', async () => { await assertSucceeds(setDoc(aliceDoc(), body({ score: FLOOR }))) })
  it('로그인하지 않은 쓰기 거부', async () => {
    await assertFails(setDoc(aliceDoc(env.unauthenticatedContext().firestore()), body()))
  })
  it('남의 uid 문서 쓰기 거부', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext('bob').firestore(), 'challenges', CID, 'scores', 'alice'), body()))
  })
  it('하한보다 작은 score 거부', async () => { await assertFails(setDoc(aliceDoc(), body({ score: FLOOR - 50 }))) })
  it('알 수 없는 과제 id 거부', async () => { await assertFails(setDoc(aliceDoc(alice(), 'c99-none-v1'), body())) })
  it('필드 추가 거부', async () => { await assertFails(setDoc(aliceDoc(), body({ extra: 1 }))) })
  it('필드 누락 거부', async () => {
    const { lines: _lines, ...rest } = body()
    await assertFails(setDoc(aliceDoc(), rest))
  })
  it('at이 서버 시각이 아니면 거부', async () => { await assertFails(setDoc(aliceDoc(), body({ at: new Date(2020, 0, 1) }))) })
  it('nickAt이 없거나 서버 시각이 아니면 거부', async () => {
    const { nickAt: _nickAt, ...rest } = body()
    await assertFails(setDoc(aliceDoc(), rest))
    await assertFails(setDoc(aliceDoc(), body({ nickAt: new Date(2020, 0, 1) })))
    await assertFails(setDoc(aliceDoc(), body({ nickAt: Timestamp.fromDate(new Date(2099, 0, 1)) })))
    await assertFails(setDoc(aliceDoc(), body({ nickAt: null })))
  })
  it('자료형이 틀리면 거부', async () => {
    await assertFails(setDoc(aliceDoc(), body({ score: 9000.5 })))
    await assertFails(setDoc(aliceDoc(), body({ nickname: 1 })))
  })
  it('닉네임이 너무 짧거나(1자) 긴(41자) 경우 거부', async () => {
    await assertFails(setDoc(aliceDoc(), body({ nickname: '가' })))
    await assertFails(setDoc(aliceDoc(), body({ nickname: '가'.repeat(41) })))
  })
})

describe('score의 모양', () => {
  const at = (cid: string) => aliceDoc(alice(), cid)
  it('시간으로 재는 과제의 score는 50의 배수여야 한다', async () => {
    for (const score of [FLOOR + 1, FLOOR + 10, FLOOR + 49, FLOOR + 525]) await assertFails(setDoc(aliceDoc(), body({ score })))
    await assertSucceeds(setDoc(aliceDoc(), body({ score: FLOOR + 50 })))
  })
  it('시간 과제의 상한은 제한 시간 × 배치 수이다', async () => {
    await assertFails(setDoc(aliceDoc(), body({ score: 60_050 })))
    await assertSucceeds(setDoc(aliceDoc(), body({ score: 60_000 })))
    await assertFails(setDoc(at('c06-sunflower-v1'), body({ score: 300_050 })))
    await assertSucceeds(setDoc(at('c06-sunflower-v1'), body({ score: 300_000 })))
  })
  it('횟수로 재는 과제의 score는 50의 배수가 아니어도 되고 상한은 제한 시간 안에 할 수 있는 횟수(540)이다', async () => {
    const crate = () => at('c08-crate-v1')
    await assertFails(setDoc(crate(), body({ score: 18 })))
    await assertFails(setDoc(crate(), body({ score: 100_000 })))
    await assertFails(setDoc(crate(), body({ score: 541 })))
    await assertSucceeds(setDoc(crate(), body({ score: 540 })))
    await env.clearFirestore()
    await assertSucceeds(setDoc(crate(), body({ score: 19 })))
  })
  it('더 좋은 기록으로 바꿀 때에도 50의 배수여야 한다', async () => {
    await seed()
    await assertFails(updateDoc(aliceDoc(), better({ score: FLOOR + 110 })))
    await assertSucceeds(updateDoc(aliceDoc(), better({ score: FLOOR + 150 })))
  })
})

describe('scores 갱신', () => {
  beforeEach(async () => { await seed() })
  it('더 나쁜 기록으로 갱신 거부', async () => { await assertFails(updateDoc(aliceDoc(), better({ score: FLOOR + 900 }))) })
  it('같은 기록으로 갱신 거부', async () => { await assertFails(updateDoc(aliceDoc(), better({ score: FLOOR + 500 }))) })
  it('더 좋은 기록으로 갱신 성공', async () => { await assertSucceeds(updateDoc(aliceDoc(), better())) })
  it('닉네임만 갱신 성공(닉네임을 정한 지 60초가 넘었을 때)', async () => { await assertSucceeds(updateDoc(aliceDoc(), rename())) })
  it('닉네임을 바꾸면서 score를 나쁘게 바꾸기 거부', async () => {
    await assertFails(updateDoc(aliceDoc(), { ...rename(), score: FLOOR + 900 }))
  })
  it('닉네임을 바꾸면서 at을 바꾸기 거부', async () => {
    await assertFails(updateDoc(aliceDoc(), { ...rename(), at: serverTimestamp() }))
  })
  it('삭제 거부', async () => { await assertFails(deleteDoc(aliceDoc())) })
})

describe('닉네임 변경 간격(nickAt)', () => {
  it('만든 직후에는 닉네임을 바꿀 수 없다', async () => {
    await assertSucceeds(setDoc(aliceDoc(), body()))
    await assertFails(updateDoc(aliceDoc(), rename()))
  })
  it('nickAt이 60초보다 오래되었으면 바꿀 수 있고, 바꾼 직후에는 다시 바꿀 수 없다', async () => {
    await assertSucceeds(setDoc(aliceDoc(), body()))
    await patch({ nickAt: new Date(Date.now() - 120_000) })
    await assertSucceeds(updateDoc(aliceDoc(), rename()))
    await assertFails(updateDoc(aliceDoc(), rename('또바꿈')))
    await assertFails(updateDoc(aliceDoc(), rename('농부')))
  })
  it('nickAt이 60초가 지나지 않았으면 거부', async () => {
    await seed()
    await patch({ nickAt: new Date(Date.now() - 30_000) })
    await assertFails(updateDoc(aliceDoc(), rename()))
  })
  it('닉네임이 그대로인데 nickAt을 바꾸기 거부', async () => {
    await seed()
    await assertFails(updateDoc(aliceDoc(), { nickAt: serverTimestamp() }))
    await assertFails(updateDoc(aliceDoc(), rename('농부')))
    await assertFails(updateDoc(aliceDoc(), better({ nickAt: serverTimestamp() })))
  })
  it('닉네임을 바꾸면서 nickAt을 그대로 두거나 서버 시각이 아닌 값으로 쓰기 거부', async () => {
    await seed()
    await assertFails(updateDoc(aliceDoc(), { nickname: '새이름' }))
    await assertFails(updateDoc(aliceDoc(), { nickname: '새이름', nickAt: new Date(2026, 5, 1) }))
  })
  it('아무것도 바꾸지 않는 갱신 거부', async () => {
    await seed()
    await assertFails(updateDoc(aliceDoc(), { nickname: '농부' }))
    await assertFails(setDoc(aliceDoc(), { nickname: '농부', score: FLOOR + 500, actions: 10, lines: 5, at: OLD, nickAt: OLD }))
  })
  it('더 좋은 기록으로 바꾸면서 닉네임을 그대로 두면 nickAt도 그대로 두어야 성공', async () => {
    await assertSucceeds(setDoc(aliceDoc(), body()))
    await assertSucceeds(updateDoc(aliceDoc(), better()))
  })
  it('더 좋은 기록으로 바꾸면서 닉네임도 바꾸는 갱신에도 60초 제한이 적용된다', async () => {
    await assertSucceeds(setDoc(aliceDoc(), body()))
    await assertFails(updateDoc(aliceDoc(), { ...better(), ...rename() }))
    await assertFails(updateDoc(aliceDoc(), { ...better(), nickname: '새이름' }))
    await patch({ nickAt: new Date(Date.now() - 120_000) })
    await assertSucceeds(updateDoc(aliceDoc(), { ...better(), ...rename() }))
  })
})

describe('scores 읽기', () => {
  it('목록 읽기는 로그인 없이 성공', async () => {
    await seed()
    const db = env.unauthenticatedContext().firestore()
    await assertSucceeds(getDocs(collection(db, 'challenges', CID, 'scores')))
  })
})

describe('private/code 읽기', () => {
  beforeEach(async () => { await seed(); await seedCode() })
  it('본인 읽기 성공', async () => { await assertSucceeds(getDoc(codeDoc())) })
  it('남이 읽기 거부', async () => { await assertFails(getDoc(codeDoc(env.authenticatedContext('bob').firestore()))) })
  it('로그인하지 않은 읽기 거부', async () => { await assertFails(getDoc(codeDoc(env.unauthenticatedContext().firestore()))) })
  it('컬렉션 그룹 쿼리로 private 읽기 거부', async () => {
    await assertFails(getDocs(collectionGroup(alice(), 'private')))
    await assertFails(getDocs(collectionGroup(env.unauthenticatedContext().firestore(), 'private')))
  })
})

describe('private/code 쓰기', () => {
  const bobCode = () => doc(env.authenticatedContext('bob').firestore(), 'challenges', CID, 'scores', 'alice', 'private', 'code')
  it('새 기록과 코드를 한 묶음으로 쓰기 성공', async () => {
    await assertSucceeds(createWithCode({ code: 'x' }))
  })
  it('더 좋은 기록과 코드를 한 묶음으로 쓰기 성공', async () => {
    await assertSucceeds(createWithCode({ code: 'slow()' }))
    await assertSucceeds(updateWithCode({ code: 'fast()' }, better()))
    await seedCode('a')
    await patch({ nickAt: new Date(Date.now() - 120_000) })
    await assertSucceeds(updateWithCode({ code: 'faster()' }, { ...better({ score: FLOOR + 50 }), ...rename() }))
  })
  it('점수 문서 없이 코드만 쓰기 거부', async () => {
    await assertFails(setDoc(codeDoc(), { code: 'x' }))
  })
  it('점수 문서가 이미 있어도 코드만 따로 쓰기 거부', async () => {
    await seed()
    await assertFails(setDoc(codeDoc(), { code: 'a' }))
    await seedCode('a')
    await assertFails(setDoc(codeDoc(), { code: 'b' }))
    await assertFails(updateDoc(codeDoc(), { code: 'b' }))
  })
  it('방금 만든 기록이 있어도 다음 요청에서 코드만 다시 쓰기 거부', async () => {
    await assertSucceeds(createWithCode({ code: 'x' }))
    await assertFails(setDoc(codeDoc(), { code: 'y' }))
  })
  it('닉네임만 바꾸면서 코드를 쓰기 거부', async () => {
    await seed()
    await seedCode('a')
    await assertFails(updateWithCode({ code: 'b' }, rename()))
  })
  it('거부되는 점수 갱신과 한 묶음인 코드 쓰기 거부', async () => {
    await seed()
    await assertFails(updateWithCode({ code: 'b' }, better({ score: FLOOR + 900 })))
  })
  it('20,000자 성공, 20,001자 거부', async () => {
    await assertFails(createWithCode({ code: 'a'.repeat(20_001) }))
    await assertSucceeds(createWithCode({ code: 'a'.repeat(20_000) }))
  })
  it('다른 필드, 필드 누락, 숫자 code, 다른 문서 id 거부', async () => {
    await assertFails(createWithCode({ code: 'x', extra: 1 }))
    await assertFails(createWithCode({}))
    await assertFails(createWithCode({ code: 5 }))
    const db = alice()
    const batch = writeBatch(db)
    batch.set(aliceDoc(db), body())
    batch.set(doc(db, 'challenges', CID, 'scores', 'alice', 'private', 'other'), { code: 'x' })
    await assertFails(batch.commit())
  })
  it('표에 없는 과제 id의 private/code 쓰기 거부', async () => {
    const db = alice()
    const batch = writeBatch(db)
    batch.set(aliceDoc(db, 'zzz-junk'), body())
    batch.set(doc(db, 'challenges', 'zzz-junk', 'scores', 'alice', 'private', 'code'), { code: 'x' })
    await assertFails(batch.commit())
    await assertFails(setDoc(doc(db, 'challenges', 'zzz-junk', 'scores', 'alice', 'private', 'code'), { code: 'x' }))
  })
  it('남이 쓰기와 갱신 거부', async () => {
    await seed()
    await seedCode('a')
    await assertFails(setDoc(bobCode(), { code: 'b' }))
    await assertFails(setDoc(bobCode(), { code: 'c' }, { merge: true }))
  })
  it('삭제 거부', async () => {
    await seed()
    await seedCode('a')
    await assertFails(deleteDoc(codeDoc()))
  })
})

describe('scores 갱신(회귀 방지)', () => {
  beforeEach(async () => { await seed() })
  const bob = () => doc(env.authenticatedContext('bob').firestore(), 'challenges', CID, 'scores', 'alice')
  it('더 좋은 기록으로 바꾸면서 at을 옛 값으로 두기 거부', async () => {
    await assertFails(updateDoc(aliceDoc(), better({ at: Timestamp.fromDate(OLD) })))
    await assertFails(updateDoc(aliceDoc(), { score: FLOOR + 100 }))
  })
  it('닉네임만 바꾸는 갱신에서 actions나 lines를 함께 바꾸기 거부', async () => {
    await assertFails(updateDoc(aliceDoc(), { ...rename(), actions: 11 }))
    await assertFails(updateDoc(aliceDoc(), { ...rename(), lines: 6 }))
  })
  it('닉네임 갱신에서 빈 문자열, 숫자, 41자 거부', async () => {
    await assertFails(updateDoc(aliceDoc(), rename('')))
    await assertFails(updateDoc(aliceDoc(), { nickname: 12, nickAt: serverTimestamp() }))
    await assertFails(updateDoc(aliceDoc(), rename('가'.repeat(41))))
  })
  it('남이 갱신하기와 삭제하기 거부', async () => {
    await assertFails(updateDoc(bob(), rename('남의이름')))
    await assertFails(deleteDoc(bob()))
  })
})

describe('scores 생성(잘못된 값)', () => {
  it('score가 음수, null, 문자열, true이면 거부', async () => {
    for (const score of [-1, null, '9000', true]) await assertFails(setDoc(aliceDoc(), body({ score })))
  })
  it('actions와 lines가 음수이거나 상한을 넘으면 거부', async () => {
    for (const actions of [-1, 1_000_001]) await assertFails(setDoc(aliceDoc(), body({ actions })))
    for (const lines of [-1, 20_001]) await assertFails(setDoc(aliceDoc(), body({ lines })))
  })
  it('상한 값은 허용(lines는 코드 길이의 한도와 같은 20000)', async () => {
    await assertSucceeds(setDoc(aliceDoc(), body({ actions: 1_000_000, lines: 20_000 })))
  })
  it('at이 미래 시각이거나 null이면 거부', async () => {
    await assertFails(setDoc(aliceDoc(), body({ at: Timestamp.fromDate(new Date(2099, 0, 1)) })))
    await assertFails(setDoc(aliceDoc(), body({ at: null })))
  })
})

describe('그 밖의 경로', () => {
  it('challenges/x 문서와 other/y 읽기·쓰기 거부', async () => {
    const db = alice()
    await assertFails(getDoc(doc(db, 'challenges', 'x')))
    await assertFails(setDoc(doc(db, 'challenges', 'x'), { a: 1 }))
    await assertFails(getDoc(doc(db, 'other', 'y')))
    await assertFails(setDoc(doc(db, 'other', 'y'), { a: 1 }))
  })
})
