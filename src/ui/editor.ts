import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { StateEffect, StateField, type Range } from '@codemirror/state'
import {
  Decoration, type DecorationSet, EditorView, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, keymap, lineNumbers,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

export interface Editor {
  getCode(): string
  setCode(code: string): void
  setRunLine(line: number): void // 0이면 강조를 지운다
  setErrorLine(line: number): void // 0이면 강조를 지운다
  // 이번 프레임에 실행을 시작한 줄(recentLines)을 받아 잠깐 옅게 표시한다. 같은 줄이 다시 오면 시간이 늘어난다.
  // nowMs는 단조 증가하는 시각(밀리초)이다. 줄이 없으면 만료된 줄만 정리한다.
  setTrail(lines: readonly number[], nowMs: number): void
  clearTrail(): void
  onChange(handler: (code: string) => void): void
  focus(): void
  destroy(): void // 편집기를 화면에서 떼어 낸다. 그 뒤에는 다른 함수를 불러도 아무 일도 하지 않는다
}

export const TRAIL_MS = 450

const setLines = StateEffect.define<{ run: number; error: number; trail: readonly number[] }>()

const lineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setLines)) continue
      const marks: Range<Decoration>[] = []
      const add = (line: number, cls: string) => {
        if (line >= 1 && line <= tr.state.doc.lines) {
          marks.push(Decoration.line({ class: cls }).range(tr.state.doc.line(line).from))
        }
      }
      add(e.value.run, 'cm-run-line')
      if (e.value.error !== e.value.run) add(e.value.error, 'cm-error-line')
      for (const line of e.value.trail) if (line !== e.value.run && line !== e.value.error) add(line, 'cm-trail-line')
      deco = Decoration.set(marks, true)
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#0b1622', color: '#e8eef2', fontSize: '15px' },
  '&.cm-focused': { outline: '2px solid #17a2a4', outlineOffset: '-2px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { caretColor: '#e8eef2' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#e8eef2' },
  '.cm-gutters': { backgroundColor: '#0e1b2a', color: '#6f8799', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(23, 162, 164, 0.07)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(23, 162, 164, 0.12)', color: '#e8eef2' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(23, 162, 164, 0.35)',
  },
  '.cm-run-line': { backgroundColor: 'rgba(23, 162, 164, 0.42)' },
  // 지나가며 실행된 줄의 흔적. 한눈에 보이도록 줄 전체에 꽤 짙은 청록 배경과 3px 왼쪽 표시를 두되, 실행 줄(0.42)보다는 옅게 한다.
  // 테두리가 아니라 안쪽 그림자라 줄 높이와 글자 위치가 달라지지 않는다. 사라질 때 서서히 옅어지는 움직임은 없으므로 움직임 줄이기 설정에서도 같게 보인다.
  '.cm-trail-line': { backgroundColor: 'rgba(23, 162, 164, 0.25)', boxShadow: 'inset 3px 0 0 #17a2a4' },
  '.cm-error-line': { backgroundColor: 'rgba(255, 180, 84, 0.22)', borderLeft: '3px solid #ffb454' },
  '.cm-tooltip': { backgroundColor: '#13273a', color: '#e8eef2', border: '1px solid #234158' },
}, { dark: true })

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: '#7fd6d8' },
  { tag: [t.bool, t.null, t.number], color: '#ffb454' },
  { tag: [t.string, t.special(t.string)], color: '#a8d98a' },
  { tag: t.comment, color: '#6f8799', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#9cc9ff' },
  { tag: [t.operator, t.punctuation], color: '#c3d0d9' },
])

export function createEditor(parent: HTMLElement, initialCode: string): Editor {
  const handlers: ((code: string) => void)[] = []
  let destroyed = false
  let runLine = 0
  let errorLine = 0

  const view = new EditorView({
    parent,
    doc: initialCode,
    extensions: [
      // 필요한 기능만 고른다. 묶음(basicSetup)에 든 검색 창은 영어로만 나오고, 자동 완성은 이 게임이
      // 지원하지 않는 파이썬 키워드를 권하므로 넣지 않는다.
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      python(),
      indentUnit.of('    '),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      lineField,
      theme,
      syntaxHighlighting(highlight),
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return
        // 줄 번호가 바뀌므로 흔적은 지운다(이 갱신 안에서는 새로 보낼 수 없어 다음 프레임에 반영된다).
        trailUntil.clear()
        const code = update.state.doc.toString()
        for (const h of handlers) h(code)
      }),
    ],
  })

  // 표시 중인 흔적 줄. 줄 번호 → 사라질 시각. 줄마다 타이머를 두지 않고 프레임마다 정리한다.
  const trailUntil = new Map<number, number>()
  let shownTrail: number[] = [] // 마지막으로 편집기에 보낸 흔적 줄(오름차순, 실행 줄과 오류 줄 제외)

  const trailLines = (): number[] => {
    const lines: number[] = []
    for (const line of trailUntil.keys()) if (line !== runLine && line !== errorLine) lines.push(line)
    return lines.sort((a, b) => a - b)
  }
  const sameLines = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])

  const pushLines = () => {
    if (destroyed) return
    shownTrail = trailLines()
    view.dispatch({ effects: setLines.of({ run: runLine, error: errorLine, trail: shownTrail }) })
  }
  // 보이는 흔적 줄이 실제로 달라졌을 때에만 편집기에 보낸다.
  const syncTrail = () => {
    if (!sameLines(trailLines(), shownTrail)) pushLines()
  }

  return {
    getCode: () => view.state.doc.toString(),
    setCode(code) {
      if (destroyed) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } })
    },
    setRunLine(line) {
      if (line === runLine) return
      runLine = line
      pushLines()
    },
    setErrorLine(line) {
      if (line === errorLine) return
      errorLine = line
      if (line !== 0) trailUntil.clear() // 오류가 나면 흔적은 지운다
      pushLines()
    },
    setTrail(lines, nowMs) {
      if (lines.length === 0 && trailUntil.size === 0 && shownTrail.length === 0) return
      for (const line of lines) trailUntil.set(line, nowMs + TRAIL_MS)
      for (const [line, until] of trailUntil) if (until <= nowMs) trailUntil.delete(line)
      syncTrail()
    },
    clearTrail() {
      if (trailUntil.size === 0 && shownTrail.length === 0) return
      trailUntil.clear()
      syncTrail()
    },
    onChange(handler) { handlers.push(handler) },
    focus() { if (!destroyed) view.focus() },
    destroy() {
      if (destroyed) return
      destroyed = true
      handlers.length = 0
      view.destroy()
    },
  }
}
