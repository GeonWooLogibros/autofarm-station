import { describe, expect, test } from 'vitest'
import { deserialize, serialize } from '../../src/progress/save'

// 이전에 배포한 판(커밋 b9b4680)의 코드로 만든 저장 데이터이다. 해금 12개, 4×4 선반, 자원과 코드가 있는 상태이다.
const OLD_SAVE = '{"version":1,"code":"for i in range(4):\\n    harvest()\\n    move(Right)\\n","unlocked":["loop","speed1","expand1","cond","strawberry","expand2","watering","var","func","tulip","for","expand3"],"world":{"w":4,"h":4,"cells":[{"plant":"Daisy","growth":1,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0},{"plant":null,"growth":0,"water":0,"wilted":false,"value":0}],"droneX":0,"droneY":0,"items":{"Daisy":123,"Strawberry":45,"Tulip":67,"Sunflower":0,"Tomato":0,"Crate":0,"Power":0,"Coin":8,"Water":0},"waterCap":20,"waterTimerMs":0,"powerActions":0,"yieldMult":{"Daisy":1,"Strawberry":1,"Tulip":1},"rng":7,"timeMs":0},"playMs":90000,"finishedAtMs":null,"settings":{"guide":true,"sound":true},"seenGuides":["loop"]}'

describe('이전 판의 저장 데이터', () => {
  test('지금의 deserialize가 받아들인다', () => {
    const game = deserialize(OLD_SAVE)
    expect(game).not.toBeNull()
    expect(game!.unlocked.size).toBe(12)
    expect(game!.world.state.w).toBe(4)
    expect(game!.world.state.h).toBe(4)
    expect(game!.world.state.items.Daisy).toBe(123)
    expect(game!.code).toBe('for i in range(4):\n    harvest()\n    move(Right)\n')
  })

  test('다시 serialize하면 원래 문자열과 같다', () => {
    expect(serialize(deserialize(OLD_SAVE)!)).toBe(OLD_SAVE)
  })

  test('불러온 게임이 실행된다', () => {
    const game = deserialize(OLD_SAVE)!
    expect(game.run()).toBe(true)
    for (let i = 0; i < 400; i++) game.tick(50)
    expect(game.status).not.toBe('error')
    expect(game.world.state.items.Daisy).toBeGreaterThan(123)
  })
})
