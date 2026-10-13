import { SAVE_KEY, type StorageLike } from '../progress/save'
import type { Audio } from './audio'
import { icon, ignoreKeyRepeat, type IconName } from './chrome'
import { SHOWCASE_H, buildShowcase } from './greenhouse'
import type { Screen } from './router'

export function startLabel(hasSave: boolean): string {
  return hasSave ? '이어하기' : '시작하기'
}

// 본편의 저장 데이터가 있는지. 저장소를 읽을 수 없으면 없는 것으로 본다.
export function hasMainSave(storage: StorageLike): boolean {
  try {
    const raw = storage.getItem(SAVE_KEY)
    return raw !== null && raw !== ''
  } catch {
    return false
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
// 장면의 좌표 너비. 창의 비율을 따르되 이 범위를 벗어나면 가장자리가 잘린다(가운데는 언제나 보인다).
const MIN_W = 900
const MAX_W = 1800

export function createStartScreen(
  root: HTMLElement, opts: { hasSave: boolean; onStart(): void; onChallenges(): void; audio: Audio },
): Screen {
  const screen = document.createElement('div')
  screen.className = 'start-screen'

  // 배경은 꾸밈이므로 화면 낭독기에는 알리지 않는다. 글자는 제목과 버튼 두 개뿐이다.
  const scene = document.createElementNS(SVG_NS, 'svg')
  scene.setAttribute('class', 'greenhouse start-scene')
  scene.setAttribute('preserveAspectRatio', 'xMidYMid slice')
  scene.setAttribute('aria-hidden', 'true')
  let sceneW = 0
  const draw = (width: number, height: number): void => {
    if (!(width > 0) || !(height > 0)) return
    const next = Math.min(MAX_W, Math.max(MIN_W, Math.round((SHOWCASE_H * width) / height)))
    if (next === sceneW) return
    sceneW = next
    buildShowcase(scene, next)
  }

  const title = document.createElement('h1')
  title.className = 'start-title'
  title.textContent = '오토팜 스테이션'

  const actions = document.createElement('div')
  actions.className = 'start-actions'
  const button = (label: string, name: IconName, primary: boolean, onPress: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = primary ? 'btn primary start-btn' : 'btn start-btn'
    const text = document.createElement('span')
    text.textContent = label
    b.append(icon(name), text)
    ignoreKeyRepeat(b)
    b.addEventListener('click', () => {
      opts.audio.play('click')
      onPress()
    })
    actions.append(b)
    return b
  }
  const first = button(startLabel(opts.hasSave), 'play', true, opts.onStart)
  button('도전 과제', 'trophy', false, opts.onChallenges)

  screen.append(scene, title, actions)
  root.replaceChildren(screen)
  draw(screen.clientWidth, screen.clientHeight)
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => draw(screen.clientWidth, screen.clientHeight))
    : null
  observer?.observe(screen)
  first.focus()

  return {
    frame() {},
    destroy() {
      observer?.disconnect()
      root.replaceChildren()
    },
  }
}
