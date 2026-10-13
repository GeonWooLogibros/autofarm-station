// mulberry32
export function nextRandom(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
