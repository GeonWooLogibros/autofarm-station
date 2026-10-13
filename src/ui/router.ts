import type { RankingService } from '../online'
import { challengeById } from '../progress/challenges'
import { loadGame, type StorageLike } from '../progress/save'
import { createApp } from './app'
import type { Audio } from './audio'
import { createChallengeApp } from './challengeApp'
import { createChallengeList } from './challengeList'
import { installTints } from './chrome'
import { createStartScreen, hasMainSave } from './startScreen'

// 화면 하나. 한 번에 하나만 떠 있고, 다른 화면으로 옮길 때 destroy로 자신이 만든 것을 모두 해제한다.
export interface Screen { frame(dtMs: number): void; destroy(): void }
export type Route = { name: 'start' } | { name: 'main' } | { name: 'challenges' } | { name: 'challenge'; id: string }
export interface RouterDeps { storage: StorageLike; audio: Audio; ranking: RankingService; now: () => number; seed: () => number }
export interface Router { frame(dtMs: number): void; go(route: Route): void }

export function createRouter(root: HTMLElement, deps: RouterDeps): Router {
  // 틀과 단추의 색 필터는 모든 화면이 함께 쓰므로, 화면이 비워지는 root 밖에 한 번만 넣는다.
  installTints(root.ownerDocument.body)
  // 본편의 게임은 한 번만 불러와 들고 있는다. 저장할 수 없는 브라우저에서도 시작 화면을 오가는 동안 진행이 남는다.
  const mainGame = loadGame(deps.storage, deps.seed())
  let enteredMain = false
  // 소리 켜짐 설정은 본편의 설정을 따른다. 본편에 들어가기 전의 시작 화면에서도 같게 한다.
  deps.audio.setEnabled(mainGame.settings.sound)
  let screen: Screen | null = null

  const build = (route: Route): Screen => {
    const toStart = (): void => go({ name: 'start' })
    switch (route.name) {
      case 'start':
        return createStartScreen(root, {
          hasSave: enteredMain || hasMainSave(deps.storage),
          onStart: () => go({ name: 'main' }),
          onChallenges: () => go({ name: 'challenges' }),
          audio: deps.audio,
        })
      case 'main': {
        // 떠나 있는 동안에는 frame을 부르지 않으므로 본편의 시간이 흐르지 않는다.
        const app = createApp(root, mainGame, deps.storage, { audio: deps.audio, onExit: toStart })
        enteredMain = true
        return app
      }
      case 'challenges':
        return createChallengeList(root, {
          storage: deps.storage, audio: deps.audio, ranking: deps.ranking, now: deps.now,
          onBack: toStart,
          onOpen: id => go({ name: 'challenge', id }),
        })
      case 'challenge': {
        const def = challengeById(route.id)
        // 알 수 없는 과제이면 과제 목록으로 돌려보낸다.
        if (!def) return build({ name: 'challenges' })
        return createChallengeApp(root, def, {
          storage: deps.storage, audio: deps.audio, ranking: deps.ranking, now: deps.now,
          settings: mainGame.settings,
          onBack: () => go({ name: 'challenges' }),
        })
      }
    }
  }

  // 화면을 옮기는 도중에 go가 다시 불리면(destroy나 화면을 만드는 코드가 부른 경우) 끝난 뒤에 마지막 요청만 따른다.
  let moving = false
  let queued: Route | null = null

  function go(route: Route): void {
    if (moving) { queued = route; return }
    moving = true
    try {
      // 앞 화면의 정리가 실패해도 화면은 옮긴다.
      try { screen?.destroy() } catch (err) { console.error(err) }
      screen = null
      root.replaceChildren()
      try {
        screen = build(route)
      } catch (err) {
        // 새 화면을 만들지 못하면 시작 화면으로 돌아간다. 시작 화면도 만들지 못하면 빈 화면으로 둔다.
        console.error(err)
        root.replaceChildren()
        if (route.name !== 'start') {
          try { screen = build({ name: 'start' }) } catch (again) { console.error(again); root.replaceChildren() }
        }
      }
    } finally {
      moving = false
    }
    const next = queued
    queued = null
    if (next) go(next)
  }

  go({ name: 'start' })
  return {
    frame(dtMs) { screen?.frame(dtMs) },
    go,
  }
}
