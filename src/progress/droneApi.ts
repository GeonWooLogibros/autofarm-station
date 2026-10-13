import { World } from '../sim/world'
import { PLANT_KINDS, ITEM_KINDS, type Dir, type ItemKind, type PlantKind } from '../sim/types'
import { builtins } from '../lang/builtins'
import { HostError } from '../lang/errors'
import type { LockedText } from '../lang/checker'
import { constant, display, host, type Value } from '../lang/values'
import { UNLOCKS, unlockedPlants, type UnlockId } from './unlocks'

export const PLANT_LABEL: Record<PlantKind, string> = {
  Daisy: '데이지', Strawberry: '딸기', Tulip: '튤립', Sunflower: '해바라기', Tomato: '토마토', Crate: '과일 상자',
}
export const ITEM_LABEL: Record<ItemKind, string> = { ...PLANT_LABEL, Power: '전력', Coin: '코인', Water: '물' }

export interface DroneApi { globals: Map<string, Value>; lockedNames: Map<string, string> }

const DIRS: Dir[] = ['Right', 'Left', 'Up', 'Down']
const ACTION = 200
const SENSE = 1

function constName<T extends string>(v: Value, names: readonly T[], message: string): T {
  if (v !== null && typeof v === 'object' && v.k === 'const' && (names as readonly string[]).includes(v.name)) return v.name as T
  // "Right"처럼 따옴표를 붙여 쓴 경우에는 무엇을 고쳐야 하는지 덧붙인다.
  throw new HostError(typeof v === 'string' ? `${message} 따옴표는 붙이지 않습니다.` : message)
}
const asDir = (v: Value): Dir => constName(v, DIRS, '방향은 Right, Left, Up, Down 가운데 하나여야 합니다.')
const asPlant = (v: Value): PlantKind =>
  constName(v, PLANT_KINDS, '심을 작물은 Daisy, Strawberry, Tulip, Sunflower, Tomato, Crate 가운데 하나여야 합니다.')
const asItem = (v: Value): ItemKind => constName(v, ITEM_KINDS, '자원 이름이 올바르지 않습니다. 예: num_items(Daisy)')

export function buildDroneApi(world: World, unlocked: Set<UnlockId>, print: (text: string) => void,
  lockedText?: LockedText,
): DroneApi {
  const globals = new Map<string, Value>()
  const lockedNames = new Map<string, string>()

  for (const name of [...DIRS, ...PLANT_KINDS, 'Power', 'Coin', 'Water']) globals.set(name, constant(name))

  const functions: Value[] = [
    host('harvest', ACTION, 0, 0, () => world.harvest()),
    host('print', SENSE, 1, 1, a => { print(display(a[0])); return null }),
    host('move', ACTION, 1, 1, a => world.move(asDir(a[0]))),
    host('can_harvest', SENSE, 0, 0, () => world.canHarvest()),
    host('get_plant_type', SENSE, 0, 0, () => {
      const k = world.plantType()
      return k ? constant(k) : null
    }),
    host('plant', ACTION, 1, 1, a => {
      const k = asPlant(a[0])
      // 실행 중에 해금한 작물도 곧바로 심을 수 있도록 호출할 때마다 확인한다.
      if (!unlockedPlants(unlocked).has(k)) {
        const owner = UNLOCKS.find(u => u.plants.includes(k))
        const title = owner ? owner.title : PLANT_LABEL[k]
        throw new HostError(lockedText
          ? lockedText('plant', PLANT_LABEL[k], title)
          : `아직 해금하지 않은 작물입니다: ${PLANT_LABEL[k]}. 해금 화면에서 '${title}' 항목을 해금하면 심을 수 있습니다.`)
      }
      return world.plant(k)
    }),
    host('water', ACTION, 0, 0, () => world.water()),
    host('get_water', SENSE, 0, 0, () => world.getWater()),
    host('get_pos_x', SENSE, 0, 0, () => world.state.droneX),
    host('get_pos_y', SENSE, 0, 0, () => world.state.droneY),
    host('get_world_size', SENSE, 0, 0, () => world.state.w),
    host('num_items', SENSE, 1, 1, a => Math.floor(world.state.items[asItem(a[0])])),
    host('measure', SENSE, 0, 1, a => world.measure(a.length ? asDir(a[0]) : undefined)),
    host('swap', ACTION, 1, 1, a => world.swap(asDir(a[0]))),
    ...builtins().values(),
  ]

  const always = new Set(['harvest', 'print'])
  for (const fn of functions) {
    if (fn === null || typeof fn !== 'object' || fn.k !== 'host') continue
    if (always.has(fn.name)) { globals.set(fn.name, fn); continue }
    const owner = UNLOCKS.find(u => u.names.includes(fn.name))
    if (owner && unlocked.has(owner.id)) globals.set(fn.name, fn)
    else lockedNames.set(fn.name, owner ? owner.title : fn.name)
  }
  return { globals, lockedNames }
}
