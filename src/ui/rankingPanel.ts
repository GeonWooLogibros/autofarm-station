import type { Board, RankingService } from '../online'
import { uploadsSettled } from '../online/uploads'
import { formatScore, medalFor, type ChallengeDef, type Medal } from '../progress/challenges'
import type { ChallengeRecord } from '../progress/challengeSave'
import type { Audio } from './audio'
import { MEDAL_LABEL, NO_NICKNAME_NOTE, OFFLINE_NOTE, medalBadge } from './challengeList'
import { icon, ignoreKeyRepeat } from './chrome'
import { h } from './guideBubble'

const LOADING_TEXT = '랭킹을 불러오는 중입니다.'
const EMPTY_TEXT = '아직 기록이 없습니다. 첫 기록을 남겨 보세요.'
const NICKNAME_WHERE = '닉네임은 과제 목록 화면에서 정합니다.'
const NOT_RANKED_NOTE = '이 기록은 아직 랭킹에 오르지 않았습니다. 과제 목록을 열면 다시 올립니다.'
const NO_RECORD = '기록 없음'

export interface RankRow { rank: number; nickname: string; score: string; medal: Medal | null; mine: boolean }

// 표의 줄. 같은 기록은 같은 순위이고 그다음 순위는 건너뛴다(1, 1, 3 …). board.top은 기록이 좋은 순서이다.
export function rankRows(def: ChallengeDef, board: Board): RankRow[] {
  const rows: RankRow[] = []
  board.top.forEach((entry, i) => {
    const tied = i > 0 && board.top[i - 1].score === entry.score
    rows.push({
      rank: tied ? rows[i - 1].rank : i + 1,
      nickname: entry.nickname,
      score: formatScore(def, entry.score),
      medal: medalFor(def, entry.score),
      mine: entry.mine,
    })
  })
  return rows
}

export function myRankText(board: Board): string | null {
  return board.myRank === null ? null : `내 순위 ${board.myRank}위`
}

export interface MyLine { score: string | null; medal: Medal | null; note: string | null }

// 표 아래에 적을 내 기록. 이 브라우저의 기록과 서버의 내 기록 가운데 더 좋은 것을 적는다.
// board가 null이면 랭킹에 닿지 않은 것이고, 그때에는 알림을 붙이지 않는다(닿지 않았다는 문장이 따로 나온다).
export function myLine(def: ChallengeDef, board: Board | null, local: ChallengeRecord | undefined, nickname: string | null): MyLine {
  const server = board?.myScore ?? null
  const best = local && (server === null || local.score <= server) ? local.score : server
  let note: string | null = null
  if (board) {
    if (nickname === null) note = `${NO_NICKNAME_NOTE} ${NICKNAME_WHERE}`
    else if (local && (server === null || local.score < server)) note = NOT_RANKED_NOTE
  }
  return { score: best === null ? null : formatScore(def, best), medal: best === null ? null : medalFor(def, best), note }
}

// 랭킹 화면. 브라우저의 dialog를 써서 결과 대화 상자 위에도 뜬다. 열려 있는 동안 뒤의 화면은 누를 수 없고
// Tab은 그 안에서만 돈다. 닫으면 결과 대화 상자가 그대로 남아 있다.
export function createRankingPanel(host: HTMLElement, opts: { audio: Audio; ranking: RankingService }): {
  open(def: ChallengeDef, local: ChallengeRecord | undefined, nickname: string | null, opener?: HTMLElement | null): void
  close(): void
  isOpen(): boolean
  destroy(): void
} {
  const { audio, ranking } = opts
  const dialog = h('dialog', 'ranking-dialog')
  dialog.tabIndex = -1
  dialog.setAttribute('aria-labelledby', 'ranking-title ranking-challenge')
  const panel = h('div', 'panel frame panel-ranking')
  const head = h('header', 'panel-head')
  const title = h('h2', '', '랭킹')
  title.id = 'ranking-title'
  title.prepend(icon('trophy'))
  const challenge = h('span', 'rank-challenge')
  challenge.id = 'ranking-challenge'
  const closeBtn = h('button', 'btn panel-close', '닫기')
  closeBtn.type = 'button'
  closeBtn.prepend(icon('close'))
  head.append(title, challenge, closeBtn)
  const body = h('div', 'panel-body rank-body')
  // 불러오는 중, 닿지 않음, 기록 없음의 문장. 화면 낭독기가 바뀐 문장을 읽는다.
  const status = h('p', 'rank-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  const content = h('div', 'rank-content')
  body.append(status, content)
  const foot = h('footer', 'rank-foot')
  panel.append(head, body, foot)
  dialog.append(panel)
  host.append(dialog)

  // 열 때마다 올린다. 응답이 돌아왔을 때 번호가 다르면 닫혔거나 다른 과제를 연 것이므로 화면을 건드리지 않는다.
  let seq = 0
  let opener: HTMLElement | null = null

  const say = (text: string, kind: 'info' | 'off' = 'info'): void => {
    status.textContent = text
    status.className = `rank-status is-${kind}`
    status.hidden = text === ''
  }

  function table(rows: RankRow[]): HTMLElement {
    const scroll = h('div', 'rank-scroll')
    const el = h('table', 'rank-table')
    el.append(h('caption', 'sr-only', '상위 20명의 기록'))
    const headRow = h('tr')
    for (const [cls, text] of [['rank-no', '순위'], ['rank-name', '닉네임'], ['rank-score', '기록'], ['rank-medal', '등급']]) {
      const th = h('th', cls, text)
      th.scope = 'col'
      headRow.append(th)
    }
    const thead = h('thead')
    thead.append(headRow)
    const tbody = h('tbody')
    for (const row of rows) {
      const tr = h('tr', `rank-row${row.mine ? ' is-mine' : ''}${row.rank <= 3 ? ` is-top${row.rank}` : ''}`)
      // 닉네임은 플레이어가 쓴 글이므로 textContent로만 넣는다(h가 그렇게 한다).
      const name = h('th', 'rank-name')
      name.scope = 'row'
      const box = h('div', 'rank-name-box')
      const nick = h('span', 'rank-nick', row.nickname)
      nick.title = row.nickname
      box.append(nick)
      if (row.mine) box.append(h('span', 'rank-me', '나'))
      name.append(box)
      const medal = h('td', 'rank-medal')
      const badge = medalBadge(row.medal)
      badge.classList.add('medal-sm')
      medal.append(badge)
      if (!row.medal) medal.append(h('span', 'sr-only', '등급 없음'))
      else badge.setAttribute('aria-label', `${MEDAL_LABEL[row.medal]} 등급`)
      tr.append(h('td', 'rank-no', String(row.rank)), name, h('td', 'rank-score', row.score), medal)
      tbody.append(tr)
    }
    el.append(thead, tbody)
    scroll.append(el)
    return scroll
  }

  // 표 아래의 줄: 내 순위와 내 기록. 표가 스크롤되어도 항상 보인다.
  function renderFoot(board: Board, mine: MyLine): void {
    const line = h('div', 'rank-mine')
    const rank = myRankText(board)
    const record = h('span', 'rank-mine-score')
    const badge = medalBadge(mine.medal)
    badge.classList.add('medal-sm')
    if (mine.medal) badge.setAttribute('aria-label', `${MEDAL_LABEL[mine.medal]} 등급`)
    if (mine.score === null) {
      line.append(h('span', 'is-none', `내 ${NO_RECORD}`))
    } else {
      record.append(h('span', 'rank-mine-label', '내 기록'), h('strong', '', mine.score), badge)
      line.append(h('strong', `rank-mine-rank${rank === null ? ' is-none' : ''}`, rank ?? '내 순위 없음'), record)
    }
    foot.replaceChildren(line)
    if (mine.note) foot.append(h('p', 'rank-note', mine.note))
    foot.hidden = false
    // 20위 밖이면 표에 내 줄이 없으므로 이 줄을 강조한다.
    line.classList.toggle('is-outside', rank !== null && !board.top.some(e => e.mine))
  }

  // 랭킹에 닿지 않았을 때 표 대신 보여 주는, 이 브라우저의 내 기록
  function localCard(mine: MyLine): HTMLElement {
    const card = h('div', `rank-local${mine.medal ? ` has-${mine.medal}` : ''}`)
    const badge = medalBadge(mine.medal)
    badge.classList.add('medal-lg')
    const text = h('div', 'rank-local-text')
    text.append(
      h('span', 'rank-local-label', '이 브라우저의 내 기록'),
      h('strong', `rank-local-score${mine.score === null ? ' is-none' : ''}`, mine.score ?? NO_RECORD),
      h('span', 'rank-local-medal', mine.score === null
        ? '과제에 성공하면 기록이 여기에 남습니다.'
        : mine.medal ? `${MEDAL_LABEL[mine.medal]} 등급` : '등급 없음'),
    )
    card.append(badge, text)
    return card
  }

  function showOffline(def: ChallengeDef, local: ChallengeRecord | undefined, nickname: string | null, retry: (() => void) | null): void {
    say(OFFLINE_NOTE, 'off')
    panel.classList.add('is-compact') // 표가 없으므로 내용의 높이에 맞춘다
    content.replaceChildren(localCard(myLine(def, null, local, nickname)))
    foot.replaceChildren()
    foot.hidden = retry === null
    if (!retry) return
    const again = h('button', 'btn', '새로 고치기')
    again.type = 'button'
    again.prepend(icon('replay'))
    ignoreKeyRepeat(again)
    again.addEventListener('click', () => { audio.play('click'); retry() })
    foot.append(again)
  }

  async function load(def: ChallengeDef, local: ChallengeRecord | undefined, nickname: string | null): Promise<void> {
    const mine = seq
    say(LOADING_TEXT)
    panel.classList.remove('is-compact')
    content.replaceChildren()
    foot.replaceChildren()
    foot.hidden = true
    // 방금 세운 기록을 올리는 중이면 끝난 뒤의 랭킹을 읽는다.
    await uploadsSettled(def.id)
    if (mine !== seq) return
    const board = await ranking.board(def.id).catch(() => null)
    if (mine !== seq) return
    if (!board) {
      // 새로 고치기를 누르면 그 단추가 사라지므로 초점을 대화 상자로 옮겨 둔다.
      showOffline(def, local, nickname, () => { dialog.focus(); void load(def, local, nickname) })
      return
    }
    const rows = rankRows(def, board)
    say(rows.length === 0 ? EMPTY_TEXT : '')
    content.replaceChildren(...(rows.length === 0 ? [] : [table(rows)]))
    renderFoot(board, myLine(def, board, local, nickname))
    content.querySelector('.rank-row.is-mine')?.scrollIntoView({ block: 'nearest' })
  }

  const close = (): void => {
    seq++
    if (!dialog.open) return
    dialog.close()
    content.replaceChildren()
    const back = opener
    opener = null
    if (back && back.isConnected) back.focus()
  }

  ignoreKeyRepeat(closeBtn)
  closeBtn.addEventListener('click', () => { audio.play('click'); close() })
  // Esc는 화면(과제 화면의 keydown)이 처리한다. 브라우저가 스스로 닫는 경우에도 같은 길로 닫는다.
  dialog.addEventListener('cancel', e => { e.preventDefault(); close() })

  return {
    open(def, local, nickname, from) {
      seq++
      if (!dialog.open) {
        opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
        dialog.showModal()
      }
      challenge.textContent = `과제 ${String(def.no).padStart(2, '0')} · ${def.title}`
      dialog.focus()
      if (ranking.enabled) void load(def, local, nickname)
      else showOffline(def, local, nickname, null)
    },
    close,
    isOpen: () => dialog.open,
    destroy() {
      opener = null // 떠나는 화면의 단추로 초점을 돌려주지 않는다
      close()
      dialog.remove()
    },
  }
}
