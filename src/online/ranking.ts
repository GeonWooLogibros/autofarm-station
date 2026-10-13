// 랭킹 서비스의 공통 자료형. 화면은 이 인터페이스만 안다.
export interface RankEntry { nickname: string; score: number; mine: boolean }
export interface Board { top: RankEntry[]; myRank: number | null; myScore: number | null }
export interface Submission { challengeId: string; nickname: string; score: number; actions: number; lines: number; code: string }
// kept: 서버에 이미 같거나 더 좋은 기록이 있다(닉네임만 갱신했을 수 있다)
// failed: 다시 올려야 한다. 기록은 서버에 반영되었지만 닉네임을 고치지 못한 경우도 failed이다
export type SubmitResult = 'ok' | 'kept' | 'failed'

export interface RankingService {
  readonly enabled: boolean // false이면 화면이 랭킹 대신 안내 문장을 보여 준다
  submit(s: Submission): Promise<SubmitResult> // 예외를 던지지 않는다
  board(challengeId: string): Promise<Board | null> // 닿지 않으면 null. 예외를 던지지 않는다
}

export const offlineRanking: RankingService = {
  enabled: false,
  submit: async () => 'failed',
  board: async () => null,
}

export const CALL_TIMEOUT_MS = 8000

// 거부되거나 ms 안에 끝나지 않으면 fallback을 돌려준다.
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms)
    p.then(
      v => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(fallback) },
    )
  })
}
