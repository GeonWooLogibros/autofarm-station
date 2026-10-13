import { FIREBASE_CONFIG } from './firebaseConfig'
import { createFirebaseRanking } from './firebaseRanking'
import { offlineRanking } from './ranking'
import type { RankingService } from './ranking'

export type { Board, RankEntry, RankingService, Submission, SubmitResult } from './ranking'

// 설정값이 없거나 초기화가 실패하면 랭킹이 꺼진 서비스를 돌려준다.
export function createRanking(): RankingService {
  // 개발 서버에서 주소 끝에 #emu를 붙여 열면 Firebase 에뮬레이터(firebase.json의 포트)에 연결한다. 확인할 때에만 쓴다.
  // 조건이 import.meta.env.DEV로 시작하므로 배포 빌드에서는 이 분기가 통째로 빠진다.
  if (import.meta.env.DEV && typeof location !== 'undefined' && location.hash === '#emu') {
    try {
      return createFirebaseRanking(
        { apiKey: 'demo', authDomain: 'demo-autofarm.firebaseapp.com', projectId: 'demo-autofarm', appId: 'demo' },
        { emulator: { firestore: ['127.0.0.1', 8790], auth: 'http://127.0.0.1:9099' } },
      )
    } catch {
      return offlineRanking
    }
  }
  if (!FIREBASE_CONFIG) return offlineRanking
  try {
    return createFirebaseRanking(FIREBASE_CONFIG)
  } catch {
    return offlineRanking
  }
}
