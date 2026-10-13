import type { Stmt } from './ast'
import { HostError } from './errors'

export interface PyList { k: 'list'; items: Value[] }
export interface PyTuple { k: 'tuple'; items: Value[] }
export interface PyDict { k: 'dict'; map: Map<string, { key: Value; value: Value }> }
export interface PyFunc { k: 'func'; name: string; params: string[]; body: Stmt[] }
export interface HostFunc { k: 'host'; name: string; ticks: number; minArgs: number; maxArgs: number; call: (args: Value[]) => Value }
export interface PyConst { k: 'const'; name: string }
export type Value = number | boolean | null | string | PyList | PyTuple | PyDict | PyFunc | HostFunc | PyConst

export function host(name: string, ticks: number, minArgs: number, maxArgs: number, call: (args: Value[]) => Value): HostFunc {
  return { k: 'host', name, ticks, minArgs, maxArgs, call }
}

const constants = new Map<string, PyConst>()

// 같은 이름이면 항상 같은 객체를 돌려주므로 상수끼리는 동일 객체인지로 비교할 수 있다.
export function constant(name: string): PyConst {
  let c = constants.get(name)
  if (!c) {
    c = { k: 'const', name }
    constants.set(name, c)
  }
  return c
}

export function truthy(v: Value): boolean {
  if (v === null || v === false || v === 0 || v === '') return false
  if (typeof v !== 'object') return true
  if (v.k === 'list' || v.k === 'tuple') return v.items.length > 0
  if (v.k === 'dict') return v.map.size > 0
  return true
}

// 값 하나를 비교하거나 표시하거나 키로 바꿀 때 살펴볼 수 있는 값의 개수.
// a = [a, a]를 거듭하면 메모리는 조금만 쓰면서 살펴볼 값은 두 배씩 늘어나므로, 한도가 없으면 틱 하나 안에서 화면이 멈춘다.
const MAX_NODES = 10000

interface Budget { left: number }

function spend(budget: Budget): void {
  if (--budget.left < 0) throw new HostError('값이 너무 커서 처리할 수 없습니다.')
}

// 숫자와 참/거짓은 서로 다른 값으로 본다(1 == True는 거짓). 입문자가 헷갈리지 않게 하기 위함이다.
export function equals(a: Value, b: Value): boolean {
  return equalsIn(a, b, { left: MAX_NODES })
}

function equalsIn(a: Value, b: Value, budget: Budget): boolean {
  spend(budget)
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if ((a.k === 'list' && b.k === 'list') || (a.k === 'tuple' && b.k === 'tuple')) {
    if (a.items.length !== b.items.length) return false
    for (let i = 0; i < a.items.length; i++) {
      if (!equalsIn(a.items[i], b.items[i], budget)) return false
    }
    return true
  }
  return false
}

export function repr(v: Value): string {
  return reprIn(v, new Set(), { left: MAX_NODES })
}

// open에는 지금 표시하는 중인 객체를 담아, 자기 자신을 담은 리스트를 만나도 끝없이 들어가지 않게 한다.
function reprIn(v: Value, open: Set<object>, budget: Budget): string {
  spend(budget)
  if (v === null) return 'None'
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return `'${v}'`
  switch (v.k) {
    case 'const': return v.name
    case 'func':
    case 'host': return `<함수 ${v.name}>`
  }
  if (open.has(v)) return v.k === 'list' ? '[...]' : v.k === 'tuple' ? '(...)' : '{...}'
  open.add(v)
  let text: string
  if (v.k === 'list') {
    text = `[${v.items.map(x => reprIn(x, open, budget)).join(', ')}]`
  } else if (v.k === 'tuple') {
    const inner = v.items.map(x => reprIn(x, open, budget)).join(', ')
    text = v.items.length === 1 ? `(${inner},)` : `(${inner})`
  } else {
    const entries = [...v.map.values()].map(e => `${reprIn(e.key, open, budget)}: ${reprIn(e.value, open, budget)}`)
    text = `{${entries.join(', ')}}`
  }
  open.delete(v)
  return text
}

// print용: 문자열은 따옴표 없이 보여 준다.
export function display(v: Value): string {
  return typeof v === 'string' ? v : repr(v)
}

export function typeName(v: Value): string {
  if (v === null) return 'None'
  if (typeof v === 'number') return '숫자'
  if (typeof v === 'boolean') return '참/거짓'
  if (typeof v === 'string') return '문자열'
  switch (v.k) {
    case 'list': return '리스트'
    case 'tuple': return '튜플'
    case 'dict': return '딕셔너리'
    case 'const': return '상수'
    default: return '함수'
  }
}

// 딕셔너리의 키 문자열. 자료형을 앞에 붙여 1과 '1'이 겹치지 않게 한다.
export function keyOf(v: Value): string {
  return keyIn(v, { left: MAX_NODES })
}

function keyIn(v: Value, budget: Budget): string {
  spend(budget)
  if (v === null) return 'none'
  if (typeof v !== 'object') return `${typeof v}:${v}`
  if (v.k === 'const') return `const:${v.name}`
  // 원소의 키마다 길이를 앞에 붙여 이어, 쉼표가 든 문자열 원소도 다른 튜플과 겹치지 않게 한다.
  // (JSON으로 묶으면 겹칠 때마다 따옴표를 다시 감싸 키의 길이가 겹친 깊이만큼 두 배씩 늘어난다.)
  if (v.k === 'tuple') {
    return `tuple:${v.items.map(x => { const key = keyIn(x, budget); return `${key.length}:${key}` }).join('')}`
  }
  throw new HostError('리스트나 딕셔너리는 딕셔너리의 키로 사용할 수 없습니다.')
}
