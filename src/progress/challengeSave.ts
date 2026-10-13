import { CHALLENGES, challengeById, type ChallengeDef } from './challenges'
import type { StorageLike } from './save'

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

export function emptyChallengeData(): ChallengeData {
  return { version: 1, nickname: null, records: {}, drafts: {}, seenIntro: [] }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

// 제어 문자는 일반 범주 Cc(제어)·Cf(서식)와 줄·문단 구분자(U+2028, U+2029)이다.
// 이모지를 잇는 ZWJ(U+200D)는 Cf라서 이것이 든 닉네임은 받지 않는다. 단순한 이모지는 통과한다.
const CONTROL = /[\p{Cc}\p{Cf}\u2028\u2029]/u

export function cleanNickname(input: string): string | null {
  if (CONTROL.test(input)) return null
  const name = input.trim().replace(/\s+/g, ' ')
  const length = [...name].length
  return length >= 2 && length <= 10 ? name : null
}

// 빈 줄과 '#'으로 시작하는 줄(앞 공백 무시)은 세지 않는다.
export function countLines(code: string): number {
  let n = 0
  for (const line of code.split('\n')) {
    const t = line.trim()
    if (t !== '' && !t.startsWith('#')) n++
  }
  return n
}

// 모든 과제가 작을수록 좋아서 지금은 def를 보지 않는다.
export function isBetter(_def: ChallengeDef, score: number, old: ChallengeRecord | undefined): boolean {
  return old === undefined || score < old.score
}

function parseRecord(v: unknown, def: ChallengeDef): ChallengeRecord | null {
  if (!isObj(v)) return null
  const { score, actions, lines, code, at, uploaded } = v
  if (!isCount(score) || !isCount(actions) || !isCount(lines)) return null
  if (score < def.minScore) return null
  if (typeof code !== 'string' || code.length > MAX_CODE_CHARS) return null
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return null
  if (typeof uploaded !== 'boolean') return null
  return { score, actions, lines, code, at, uploaded }
}

function parseData(v: unknown): ChallengeData {
  const out = emptyChallengeData()
  if (!isObj(v) || v.version !== 1) return out
  if (typeof v.nickname === 'string' && cleanNickname(v.nickname) === v.nickname) out.nickname = v.nickname
  if (isObj(v.records)) {
    for (const [id, raw] of Object.entries(v.records)) {
      const def = challengeById(id)
      const rec = def && parseRecord(raw, def)
      if (rec) out.records[id] = rec
    }
  }
  if (isObj(v.drafts)) {
    for (const [id, raw] of Object.entries(v.drafts)) {
      if (challengeById(id) && typeof raw === 'string' && raw.length <= MAX_CODE_CHARS) out.drafts[id] = raw
    }
  }
  if (Array.isArray(v.seenIntro)) {
    for (const id of CHALLENGES.map(c => c.id)) if (v.seenIntro.includes(id)) out.seenIntro.push(id)
  }
  return out
}

export function loadChallengeData(storage: StorageLike): ChallengeData {
  try {
    const raw = storage.getItem(CHALLENGE_KEY)
    if (raw === null) return emptyChallengeData()
    return parseData(JSON.parse(raw))
  } catch {
    return emptyChallengeData()
  }
}

export function saveChallengeData(storage: StorageLike, data: ChallengeData): boolean {
  try {
    // 너무 긴 초안은 잘라내지 않고 그 항목만 저장하지 않는다.
    const drafts: Record<string, string> = {}
    for (const [id, code] of Object.entries(data.drafts)) if (code.length <= MAX_CODE_CHARS) drafts[id] = code
    storage.setItem(CHALLENGE_KEY, JSON.stringify({ ...data, drafts }))
    return true
  } catch {
    return false
  }
}
