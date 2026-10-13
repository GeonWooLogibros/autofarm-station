import type { Game, OutputLine } from '../progress/game'
import type { Audio } from './audio'
import { iconHtml, runShortcutLabel } from './chrome'
import { createEditor, type Editor } from './editor'

// 드론 제어 터미널: 편집기, 실행 단추, 상태등, 기록 칸. 본편과 과제 화면이 함께 쓴다.
export interface ConsoleHooks { onRun(): void; onStop(): void; onStep(): void; onEdit(code: string): void }

export interface ConsoleView {
  readonly root: HTMLElement
  readonly editor: Editor
  readonly toolbar: HTMLElement // 과제 화면이 배속 단추를 덧붙인다
  // stateText는 기록 칸 머리의 안내 문장, note는 그 옆의 알림, stale은 이 줄까지가 이전 실행에서 나온 출력이라는 표시이다.
  render(game: Game, extra: { stateText: string; note: string; stale: OutputLine | null }): void
  destroy(): void
}

// 고정된 문자열만 들어 있다. 게임 데이터나 플레이어가 쓴 글은 여기에 넣지 않는다.
const TEMPLATE = `
<header class="console-head">
  <span class="file-tab">drone.py</span>
  <h2 class="console-title">드론 제어 터미널</h2>
  <span class="run-lamp"><i class="lamp" aria-hidden="true"></i><span class="lamp-text"></span></span>
</header>
<div class="toolbar">
  <button type="button" class="btn btn-lg run primary" aria-keyshortcuts="Control+Enter Meta+Enter">${iconHtml('play')}<span class="btn-text"><span class="btn-label">실행하기</span><kbd class="run-key" aria-hidden="true">Ctrl+Enter</kbd></span></button>
  <button type="button" class="btn btn-lg stop" aria-keyshortcuts="Escape">${iconHtml('stop')}<span class="btn-text"><span class="btn-label">정지하기</span><kbd aria-hidden="true">Esc</kbd></span></button>
  <button type="button" class="btn btn-lg step">${iconHtml('step')}<span class="btn-text"><span class="btn-label">한 단계 실행하기</span></span></button>
</div>
<div class="editor-host screen"></div>
<section class="log screen" aria-label="기록">
  <header class="log-head">
    <h3>기록</h3>
    <p class="run-msg"><span class="run-state"></span><span class="run-note"></span></p>
  </header>
  <div class="output"></div>
</section>
<div class="sr-only error-announcer" aria-live="polite"></div>`

// 터미널 머리의 상태등. 자세한 안내 문장은 기록 칸의 머리에 따로 나온다.
type Lamp = 'idle' | 'running' | 'paused' | 'error'
const LAMP_TEXT: Record<Lamp, string> = { idle: '대기 중', running: '실행 중', paused: '멈춤', error: '오류' }

function lampState(game: Game): Lamp {
  if (game.status === 'error') return 'error'
  if (game.status === 'running') return game.paused ? 'paused' : 'running'
  return 'idle'
}

// host는 터미널의 틀(.code-pane)이다. 내용은 여기에서 채운다.
export function createConsole(host: HTMLElement, code: string, hooks: ConsoleHooks, audio: Audio): ConsoleView {
  host.innerHTML = TEMPLATE
  const q = <T extends HTMLElement>(sel: string) => host.querySelector<T>(sel)!
  q('.run-key').textContent = runShortcutLabel()
  const lampText = q('.lamp-text')
  const stopBtn = q<HTMLButtonElement>('.stop')
  const runState = q('.run-state')
  const runNote = q('.run-note')
  const outputEl = q('.output')

  const editor = createEditor(q('.editor-host'), code)
  editor.onChange(hooks.onEdit)

  q('.run').addEventListener('click', hooks.onRun)
  stopBtn.addEventListener('click', hooks.onStop)
  q('.step').addEventListener('click', hooks.onStep)

  // 실행 단추를 누를 때 소리를 낸다. 키를 누르고 있어서 생기는 반복 입력에는 소리를 내지 않는다.
  const toolbar = q('.toolbar')
  let keyHeld = false
  toolbar.addEventListener('keydown', e => { if (e.repeat) keyHeld = true })
  toolbar.addEventListener('keyup', () => { keyHeld = false })
  toolbar.addEventListener('click', e => {
    if (!keyHeld && e.target instanceof Element && e.target.closest('button')) audio.play('click')
  })

  let lastOutputLen = -1
  let lastOutputTail: unknown = null
  let staleShown: OutputLine | null = null
  const renderOutput = (game: Game, staleOutput: OutputLine | null): void => {
    const out = game.output
    const tail = out.length ? out[out.length - 1] : null
    if (out.length === lastOutputLen && tail === lastOutputTail && staleOutput === staleShown) return
    lastOutputLen = out.length
    lastOutputTail = tail
    staleShown = staleOutput
    const frag = document.createDocumentFragment()
    // 오래된 줄이 밀려나 기준 줄이 사라졌다면 남은 줄은 모두 이번 실행의 출력이다.
    let stale = staleOutput !== null && out.includes(staleOutput)
    for (const line of out) {
      const div = document.createElement('div')
      div.className = `line ${line.kind}${stale ? ' stale' : ''}`
      if (line === staleOutput) stale = false
      div.textContent = line.text
      frag.appendChild(div)
    }
    outputEl.replaceChildren(frag)
    outputEl.scrollTop = outputEl.scrollHeight
  }

  let lampShown: Lamp | null = null
  const renderLamp = (next: Lamp): void => {
    if (next === lampShown) return
    lampShown = next
    host.dataset.state = next
    lampText.textContent = LAMP_TEXT[next]
  }
  renderLamp('idle')

  // 오류가 새로 날 때마다 실패 소리를 한 번 낸다. 오류 줄은 출력의 마지막 줄이므로 그 줄이 바뀌었는지로 구분한다.
  const errorAnnouncer = q('.error-announcer')
  let failPlayedFor: OutputLine | null = null
  const playFailOnce = (game: Game): void => {
    if (game.status !== 'error') { failPlayedFor = null; return }
    const tail = game.output.length ? game.output[game.output.length - 1] : null
    if (tail === null || tail === failPlayedFor) return
    failPlayedFor = tail
    audio.play('fail')
    // 출력 영역은 줄이 늘 때마다 통째로 다시 그리므로, 화면 낭독기에는 오류 줄만 따로 알린다.
    errorAnnouncer.textContent = tail.kind === 'error' ? tail.text : ''
    reportInternalError(game)
  }

  // 플레이어의 코드가 아니라 게임 내부에서 난 오류는 화면에는 일반적인 안내만 보이므로, 원인을 개발자 콘솔에 남긴다.
  // 반복문 안에서 같은 오류가 거듭 나도 콘솔이 넘치지 않도록 같은 내용은 한 번만 남긴다.
  const reportedCauses = new Set<string>()
  const reportInternalError = (game: Game): void => {
    const cause = game.errorCause
    if (cause === undefined) return
    const key = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
    if (reportedCauses.has(key)) return
    reportedCauses.add(key)
    console.error('[gardener-replaced] 실행 중 내부 오류', cause)
  }

  return {
    root: host,
    editor,
    toolbar,
    render(game, extra) {
      playFailOnce(game)
      editor.setRunLine(game.currentLine)
      editor.setErrorLine(game.errorLine)
      // 즉시 끝나는 줄(while, if 등)이 이번 프레임에 실행되었다면 잠깐 옅게 표시한다. 멈추면 지운다.
      if (game.status === 'running') editor.setTrail(game.recentLines, performance.now())
      else editor.clearTrail()
      if (runState.textContent !== extra.stateText) runState.textContent = extra.stateText
      if (runNote.textContent !== extra.note) runNote.textContent = extra.note
      renderLamp(lampState(game))
      renderOutput(game, extra.stale)
      stopBtn.disabled = game.status !== 'running'
    },
    destroy() {
      editor.destroy()
      host.replaceChildren()
    },
  }
}
