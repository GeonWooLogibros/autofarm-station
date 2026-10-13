import type { RankingService, Submission, SubmitResult } from './ranking'

// 과제별 올리기 줄. 과제 목록과 과제 화면이 함께 쓴다.
// 같은 과제의 올리기는 앞선 것이 끝난 뒤에 시작하므로, 서비스가 진행 중인 올리기의 결과를 함께 돌려주는 방식이어도
// 돌아온 결과는 언제나 자신이 넘긴 기록의 결과이다.
const tails = new Map<string, Promise<unknown>>()
// 과제별로 끝나지 않은 올리기의 수. 앞선 올리기가 끝나도 뒤의 것이 남아 있으면 올리는 중이다.
const active = new Map<string, number>()

export const isUploading = (challengeId: string): boolean => (active.get(challengeId) ?? 0) > 0

// 그 과제의 올리기가 모두 끝나면 이행된다. 기다리는 동안 줄에 선 올리기도 기다린다. 거부되지 않는다.
export async function uploadsSettled(challengeId: string): Promise<void> {
  while (isUploading(challengeId)) await tails.get(challengeId)
}

// 예외를 던지지 않는다. 서비스가 던지거나 거부하면 failed이다.
export function queueSubmit(ranking: RankingService, s: Submission): Promise<SubmitResult> {
  const id = s.challengeId
  active.set(id, (active.get(id) ?? 0) + 1)
  const result: Promise<SubmitResult> = (tails.get(id) ?? Promise.resolve())
    .then(() => ranking.submit(s))
    .catch((): SubmitResult => 'failed')
    .finally(() => {
      const left = (active.get(id) ?? 1) - 1
      if (left > 0) { active.set(id, left); return }
      active.delete(id)
      tails.delete(id)
    })
  tails.set(id, result)
  return result
}
