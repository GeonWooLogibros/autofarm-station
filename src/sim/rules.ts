import type { WorldState, Cell } from './types'

const at = (s: WorldState, x: number, y: number): Cell | null =>
  x < 0 || y < 0 || x >= s.w || y >= s.h ? null : s.cells[y * s.w + x]

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

export function tulipNeighbors(s: WorldState, x: number, y: number): number {
  let n = 0
  for (const [dx, dy] of NEIGHBORS) if (at(s, x + dx, y + dy)?.plant === 'Tulip') n++
  return n
}

const ripeTomato = (c: Cell | null) => !!c && c.plant === 'Tomato' && c.growth >= 1 && !c.wilted

export function largestRipeSquare(s: WorldState, x: number, y: number): { x: number; y: number; n: number } | null {
  if (!ripeTomato(at(s, x, y))) return null
  const max = Math.min(s.w, s.h, 6)
  for (let n = max; n >= 1; n--) {
    for (let oy = y - n + 1; oy <= y; oy++) {
      for (let ox = x - n + 1; ox <= x; ox++) {
        let ok = true
        for (let j = 0; j < n && ok; j++) for (let i = 0; i < n && ok; i++) ok = ripeTomato(at(s, ox + i, oy + j))
        if (ok) return { x: ox, y: oy, n }
      }
    }
  }
  return null
}

export function isCrateSorted(s: WorldState, x: number, y: number): boolean {
  const c = at(s, x, y)
  if (!c || c.plant !== 'Crate') return false
  const heavier = [at(s, x + 1, y), at(s, x, y + 1)]
  const lighter = [at(s, x - 1, y), at(s, x, y - 1)]
  return heavier.every(n => !n || n.plant !== 'Crate' || n.value >= c.value)
    && lighter.every(n => !n || n.plant !== 'Crate' || n.value <= c.value)
}

export function sortedCrateGroup(s: WorldState, x: number, y: number): { x: number; y: number }[] {
  if (!isCrateSorted(s, x, y)) return []
  const seen = new Set<number>([y * s.w + x])
  const queue = [{ x, y }]
  for (let i = 0; i < queue.length; i++) {
    for (const [dx, dy] of NEIGHBORS) {
      const nx = queue[i].x + dx, ny = queue[i].y + dy
      if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h || seen.has(ny * s.w + nx)) continue
      if (!isCrateSorted(s, nx, ny)) continue
      seen.add(ny * s.w + nx)
      queue.push({ x: nx, y: ny })
    }
  }
  return queue
}
