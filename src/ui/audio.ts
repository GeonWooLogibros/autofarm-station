import { SOUNDS } from './sprites'

export type SoundName = keyof typeof SOUNDS

export interface Audio {
  play(name: SoundName): void
  setEnabled(on: boolean): void
}

const VOLUME = 0.35
// 자주 나거나 다른 소리와 겹쳐 나는 소리는 작게 재생한다.
const QUIET_VOLUME = 0.18
const QUIET: ReadonlySet<SoundName> = new Set<SoundName>(['water', 'click'])
const MIN_GAP_MS = 80

export function createAudio(): Audio {
  const clips = new Map<SoundName, HTMLAudioElement>()
  const lastAt = new Map<SoundName, number>()
  let enabled = true

  for (const name of Object.keys(SOUNDS) as SoundName[]) {
    try {
      const clip = new window.Audio(SOUNDS[name])
      clip.preload = 'auto'
      clip.volume = QUIET.has(name) ? QUIET_VOLUME : VOLUME
      clips.set(name, clip)
    } catch { /* 소리를 만들 수 없는 환경에서는 조용히 넘어간다 */ }
  }

  return {
    play(name) {
      if (!enabled) return
      const clip = clips.get(name)
      if (!clip) return
      const now = performance.now()
      const last = lastAt.get(name)
      if (last !== undefined && now - last < MIN_GAP_MS) return
      lastAt.set(name, now)
      try {
        clip.currentTime = 0
        // 사용자가 화면을 누르기 전에는 브라우저가 재생을 막는다. 거부는 무시한다.
        const started = clip.play()
        if (started) started.catch(() => {})
      } catch { /* 재생 실패는 게임 진행에 영향을 주지 않는다 */ }
    },
    setEnabled(on) {
      enabled = on
      if (on) return
      for (const clip of clips.values()) {
        try { clip.pause() } catch { /* 무시한다 */ }
      }
    },
  }
}
