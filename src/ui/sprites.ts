import type { PlantKind } from '../sim/types'

import plant_daisy_1_svg from '../assets/codmos/plant_daisy_1.svg?url'
import plant_daisy_2_svg from '../assets/codmos/plant_daisy_2.svg?url'
import plant_daisy_3_svg from '../assets/codmos/plant_daisy_3.svg?url'
import plant_strawberry_1_svg from '../assets/codmos/plant_strawberry_1.svg?url'
import plant_strawberry_2_svg from '../assets/codmos/plant_strawberry_2.svg?url'
import plant_strawberry_3_svg from '../assets/codmos/plant_strawberry_3.svg?url'
import plant_sunflower_1_svg from '../assets/codmos/plant_sunflower_1.svg?url'
import plant_sunflower_2_svg from '../assets/codmos/plant_sunflower_2.svg?url'
import plant_sunflower_3_svg from '../assets/codmos/plant_sunflower_3.svg?url'
import plant_tomato_1_svg from '../assets/codmos/plant_tomato_1.svg?url'
import plant_tomato_2_svg from '../assets/codmos/plant_tomato_2.svg?url'
import plant_tomato_3_svg from '../assets/codmos/plant_tomato_3.svg?url'
import plant_tulip_1_svg from '../assets/codmos/plant_tulip_1.svg?url'
import plant_tulip_2_svg from '../assets/codmos/plant_tulip_2.svg?url'
import plant_tulip_3_svg from '../assets/codmos/plant_tulip_3.svg?url'
import seed_svg from '../assets/codmos/seed.svg?url'
import pot_body_svg from '../assets/codmos/pot_body.svg?url'
import pot_shadow_svg from '../assets/codmos/pot_shadow.svg?url'
import drop_svg from '../assets/codmos/drop.svg?url'
import drone_1_idle_svg from '../assets/codmos/drone_1_idle.svg?url'
import drone_1_loaded_svg from '../assets/codmos/drone_1_loaded.svg?url'
import crate_strawberry_svg from '../assets/codmos/crate_strawberry.svg?url'
import crate_lemon_svg from '../assets/codmos/crate_lemon.svg?url'
import crate_peach_svg from '../assets/codmos/crate_peach.svg?url'
import crate_apple_svg from '../assets/codmos/crate_apple.svg?url'
import crate_orange_svg from '../assets/codmos/crate_orange.svg?url'
import crate_grapes_svg from '../assets/codmos/crate_grapes.svg?url'
import crate_pineapple_svg from '../assets/codmos/crate_pineapple.svg?url'
import crate_watermelon_svg from '../assets/codmos/crate_watermelon.svg?url'
import truck_closed_svg from '../assets/codmos/truck_closed.svg?url'
import truck_open_svg from '../assets/codmos/truck_open.svg?url'
import char_1_int_idle_svg from '../assets/codmos/char_1_int_idle.svg?url'
import char_1_int_action_svg from '../assets/codmos/char_1_int_action.svg?url'
import SFX_Click_01_mp3 from '../assets/codmos/SFX_Click_01.mp3?url'
import SFX_Drop_mp3 from '../assets/codmos/SFX_Drop.mp3?url'
import SFX_Drag_mp3 from '../assets/codmos/SFX_Drag.mp3?url'
import SFX_Fail_mp3 from '../assets/codmos/SFX_Fail.mp3?url'
import SFX_Success_mp3 from '../assets/codmos/SFX_Success.mp3?url'
import SFX_Pannel_Open_mp3 from '../assets/codmos/SFX_Pannel_Open.mp3?url'

export const PLANT_SPRITES: Record<Exclude<PlantKind, 'Crate'>, [string, string, string]> = {
  Daisy: [plant_daisy_1_svg, plant_daisy_2_svg, plant_daisy_3_svg],
  Strawberry: [plant_strawberry_1_svg, plant_strawberry_2_svg, plant_strawberry_3_svg],
  Tulip: [plant_tulip_1_svg, plant_tulip_2_svg, plant_tulip_3_svg],
  Sunflower: [plant_sunflower_1_svg, plant_sunflower_2_svg, plant_sunflower_3_svg],
  Tomato: [plant_tomato_1_svg, plant_tomato_2_svg, plant_tomato_3_svg],
}
export const SEED_SPRITE: string = seed_svg
export const POT_SPRITE: string = pot_body_svg
export const POT_SHADOW_SPRITE: string = pot_shadow_svg
export const DROP_SPRITE: string = drop_svg
export const DRONE_SPRITES: { idle: string; loaded: string } = { idle: drone_1_idle_svg, loaded: drone_1_loaded_svg }
// 무게가 가벼운 것부터
export const CRATE_SPRITES: string[] = [
  crate_strawberry_svg, crate_lemon_svg, crate_peach_svg, crate_apple_svg, crate_orange_svg, crate_grapes_svg, crate_pineapple_svg, crate_watermelon_svg,
]
export const TRUCK_SPRITES: { open: string; closed: string } = { open: truck_open_svg, closed: truck_closed_svg }
export const INT_SPRITES: { idle: string; action: string } = { idle: char_1_int_idle_svg, action: char_1_int_action_svg }
export const SOUNDS: { click: string; plant: string; water: string; harvest: string; fail: string; unlock: string; panel: string } = {
  click: SFX_Click_01_mp3,
  plant: SFX_Drop_mp3,
  water: SFX_Drop_mp3, // 물방울이 떨어지는 소리로도 어울려 심기 소리를 작게 재생한다
  harvest: SFX_Drag_mp3,
  fail: SFX_Fail_mp3,
  unlock: SFX_Success_mp3,
  panel: SFX_Pannel_Open_mp3,
}

// 무게 0~9 → 상자 그림 8종
export function crateSprite(weight: number): string {
  return CRATE_SPRITES[Math.min(7, Math.floor((weight * 8) / 10))]
}

// 성장 정도(0~1) → 그림 단계. 0은 씨앗
export function plantStage(growth: number): 0 | 1 | 2 | 3 {
  if (growth >= 1) return 3
  if (growth >= 0.5) return 2
  if (growth > 0.1) return 1
  return 0
}
