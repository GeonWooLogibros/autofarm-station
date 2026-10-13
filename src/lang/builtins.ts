import { HostError } from './errors'
import { host, type Value } from './values'

// 틱 하나에 만들 수 있는 값의 수. 실행기의 MAX_SIZE, 값 도우미의 MAX_NODES와 같은 크기이다.
export const MAX_RANGE = 10000

function range(args: Value[]): Value {
  for (const a of args) {
    if (typeof a !== 'number' || !Number.isInteger(a)) throw new HostError('range()에는 정수를 넣어야 합니다.')
  }
  const nums = args as number[]
  const start = nums.length === 1 ? 0 : nums[0]
  const end = nums.length === 1 ? nums[0] : nums[1]
  const step = nums.length === 3 ? nums[2] : 1
  if (step === 0) throw new HostError('range()의 간격은 0이 될 수 없습니다.')
  const count = Math.max(0, Math.ceil((end - start) / step))
  if (count > MAX_RANGE) throw new HostError(`range()의 범위가 너무 큽니다. 한 번에 ${MAX_RANGE}개까지만 만들 수 있습니다.`)
  const items: Value[] = []
  for (let i = 0; i < count; i++) items.push(start + i * step)
  return { k: 'list', items }
}

function len(args: Value[]): Value {
  const x = args[0]
  if (typeof x === 'string') return x.length
  if (x !== null && typeof x === 'object') {
    if (x.k === 'list' || x.k === 'tuple') return x.items.length
    if (x.k === 'dict') return x.map.size
  }
  throw new HostError('len()은 리스트, 튜플, 딕셔너리, 문자열에만 사용할 수 있습니다.')
}

function pick(better: (a: number, b: number) => boolean): (args: Value[]) => Value {
  return args => {
    const only = args.length === 1 ? args[0] : null
    const items = only !== null && typeof only === 'object' && (only.k === 'list' || only.k === 'tuple') ? only.items : args
    if (items.length === 0) throw new HostError('비어 있는 리스트에서는 가장 큰 값이나 작은 값을 구할 수 없습니다.')
    let best: number | null = null
    for (const v of items) {
      if (typeof v !== 'number') throw new HostError('min()과 max()에는 숫자만 넣을 수 있습니다.')
      if (best === null || better(v, best)) best = v
    }
    return best
  }
}

function abs(args: Value[]): Value {
  const n = args[0]
  if (typeof n !== 'number') throw new HostError('abs()에는 숫자를 넣어야 합니다.')
  return Math.abs(n)
}

export function builtins(): Map<string, Value> {
  return new Map<string, Value>([
    ['range', host('range', 1, 1, 3, range)],
    ['len', host('len', 1, 1, 1, len)],
    ['min', host('min', 1, 1, Infinity, pick((a, b) => a < b))],
    ['max', host('max', 1, 1, Infinity, pick((a, b) => a > b))],
    ['abs', host('abs', 1, 1, 1, abs)],
  ])
}
