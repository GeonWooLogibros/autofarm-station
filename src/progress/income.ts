import type { ItemKind } from '../sim/types'

export const INCOME_WINDOW_MS = 60_000

interface Gain { item: ItemKind; amount: number; timeMs: number }

// 최근 60초 동안 수확한 양을 모아 자원별 분당 수확량을 낸다.
export class IncomeMeter {
  private gains: Gain[] = []

  add(item: ItemKind, amount: number, timeMs: number): void {
    if (!(amount > 0) || !Number.isFinite(amount) || !Number.isFinite(timeMs)) return
    // perMinute를 부르지 않아도 기록이 쌓이지 않게 여기서도 오래된 것을 버린다.
    this.gains = this.gains.filter(g => g.timeMs > timeMs - INCOME_WINDOW_MS)
    this.gains.push({ item, amount, timeMs })
  }

  get size(): number {
    return this.gains.length
  }

  perMinute(nowMs: number): Partial<Record<ItemKind, number>> {
    // 시간이 거꾸로 갔으면(되돌리기·새 실행) 이전 기록은 믿을 수 없어 모두 버린다.
    if (this.gains.some(g => g.timeMs > nowMs)) this.gains = []
    // 정확히 60초 전의 기록은 창 밖이다.
    this.gains = this.gains.filter(g => g.timeMs > nowMs - INCOME_WINDOW_MS)
    const out: Partial<Record<ItemKind, number>> = {}
    for (const g of this.gains) out[g.item] = (out[g.item] ?? 0) + g.amount
    return out
  }

  reset(): void {
    this.gains = []
  }
}
