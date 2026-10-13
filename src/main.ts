import './style.css'
import { createRanking } from './online'
import type { StorageLike } from './progress/save'
import { createAudio } from './ui/audio'
import { createRouter } from './ui/router'

// 개인정보 보호 모드 등에서 localStorage 접근 자체가 실패해도 게임은 시작한다.
function storage(): StorageLike {
  try {
    return window.localStorage
  } catch {
    // 저장할 수 없다는 것을 화면에서 알릴 수 있도록 setItem은 실패한 것으로 알린다(saveGame이 false를 돌려준다).
    return {
      getItem: () => null,
      setItem: () => { throw new Error('localStorage를 사용할 수 없습니다.') },
      removeItem: () => {},
    }
  }
}

// 저장소와 소리는 한 번만 만들어 모든 화면이 함께 쓴다. 처음 화면은 시작 화면이다.
const router = createRouter(document.getElementById('app')!, {
  storage: storage(),
  audio: createAudio(),
  ranking: createRanking(),
  now: () => Date.now(),
  seed: () => (Date.now() & 0x7fffffff) || 1,
})

let last = performance.now()
function loop(now: number) {
  requestAnimationFrame(loop) // 먼저 예약해 두어, 한 프레임이 예외를 던져도 반복이 끊기지 않는다.
  const dt = now - last
  last = now
  try {
    router.frame(dt)
  } catch (err) {
    console.error(err)
  }
}
requestAnimationFrame(loop)
