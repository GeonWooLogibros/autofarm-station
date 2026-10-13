import { describe, expect, test } from 'vitest'
import { challengeIntro, challengeManual, challengeWaterFacts, challengeWaterLine } from '../../src/progress/challengeGuide'
import { CHALLENGES, formatScore, goalText } from '../../src/progress/challenges'
import { GUIDES, guideFor } from '../../src/progress/guide'
import { waterFacts } from '../../src/progress/waterInfo'
import { WATER_FILL_MS } from '../../src/sim/balance'

describe('challengeIntro', () => {
  test.each(CHALLENGES.map(def => [def.no, def] as const))('%i번 과제의 안내는 과제 이름과 합니다체 문장으로 되어 있고 예제가 없다', (_no, def) => {
    const entry = challengeIntro(def)
    expect(entry.title).toBe(def.title)
    expect(entry.example).toBe('')
    expect(entry.goal).toBe(goalText(def))
    expect(entry.body.length).toBeGreaterThan(def.brief.length)
    expect(entry.body.slice(0, def.brief.length)).toEqual(def.brief)
    for (const sentence of entry.body) {
      expect(sentence.trim()).not.toBe('')
      expect(sentence, sentence).toMatch(/니다\.$/)
    }
  })

  test('등급 기준 기록과 제한 시간을 알려 준다', () => {
    for (const def of CHALLENGES) {
      const text = challengeIntro(def).body.join(' ')
      for (const medal of ['gold', 'silver', 'bronze'] as const) expect(text).toContain(formatScore(def, def.medals[medal]))
      expect(text).toContain(`${def.limitMs / 1000}초`)
    }
  })

  test('배치가 세 개인 과제는 제한 시간이 배치마다 적용된다고 알린다', () => {
    const multi = CHALLENGES.find(def => def.seeds.length > 1)!
    const single = CHALLENGES.find(def => def.seeds.length === 1)!
    expect(challengeIntro(multi).body.join(' ')).toContain('배치마다')
    expect(challengeIntro(single).body.join(' ')).not.toContain('배치마다')
  })
})

describe('challengeManual', () => {
  test.each(CHALLENGES.map(def => [def.no, def] as const))('%i번 과제의 설명서는 과제의 설명으로 시작하고 쓸 수 있는 항목만 담는다', (_no, def) => {
    const entries = challengeManual(def)
    expect(entries[0]).toEqual(challengeIntro(def))
    const rest = entries.slice(1)
    expect(rest.map(e => e.id)).toEqual(GUIDES.filter(g => g.id !== 'start' && def.unlocks.includes(g.id)).map(g => g.id))
    for (const entry of rest) {
      const original = guideFor(entry.id)
      expect(entry.title).toBe(original.title)
      expect(entry.example).toBe(original.example)
      expect(entry.goal).toBe('') // 본편에서 해 볼 것은 과제와 상관이 없다
      expect(entry.body.length).toBeGreaterThan(0)
      for (const sentence of entry.body) if (sentence !== challengeWaterLine(def)) expect(original.body).toContain(sentence)
    }
  })

  test('본편의 진행을 말하는 문장은 없다', () => {
    for (const def of CHALLENGES) {
      const text = challengeManual(def).flatMap(e => [e.title, ...e.body, e.goal]).join('\n')
      expect(text).not.toContain('온실에 오신 것을 환영합니다')
      expect(text).not.toMatch(/해금|엔딩|넓어졌습니다|정지한 다음 다시 실행/)
    }
  })

  test('선반 확장 항목에서는 이동을 설명하는 문장만 남는다', () => {
    const expand = challengeManual(CHALLENGES[1]).find(e => e.id === 'expand1')!
    expect(expand.body.length).toBe(guideFor('expand1').body.length - 1)
    expect(expand.body.join(' ')).toContain('move(Right)')
  })
})

describe('과제의 물 설명', () => {
  const water = CHALLENGES.find(def => def.unlocks.includes('watering'))!
  const start = water.setup(water.seeds[0])

  test('물탱크의 처음 값과 용량은 과제의 처음 상태에서, 채워지는 주기는 규칙에서 가져온다', () => {
    expect(start.items.Water).toBeGreaterThan(0)
    expect(challengeWaterLine(water))
      .toBe(`물탱크에는 물이 ${start.items.Water} 들어 있고, ${WATER_FILL_MS / 1000}초마다 1씩 채워져 ${start.waterCap}까지 찹니다.`)
  })
  test('비어 있는 채로 시작하는 과제는 그렇게 적는다', () => {
    const empty = { ...water, setup: (seed: number) => ({ ...water.setup(seed), items: { ...water.setup(seed).items, Water: 0 } }) }
    expect(challengeWaterLine(empty)).toBe(`물탱크는 비어 있는 채로 시작하고, ${WATER_FILL_MS / 1000}초마다 1씩 채워져 ${start.waterCap}까지 찹니다.`)
  })
  test('설명서의 물 항목과 물주기 항목에 비어 있는 채로 시작한다는 문장이 없다', () => {
    const facts = challengeWaterFacts(water)
    expect(facts[0]).toBe(challengeWaterLine(water))
    expect(facts).toHaveLength(waterFacts().length)
    expect(facts.slice(2)).toEqual(waterFacts().slice(2))
    const entry = challengeManual(water).find(e => e.id === 'watering')!
    expect(entry.body).toContain(challengeWaterLine(water))
    expect(entry.body).toHaveLength(guideFor('watering').body.length)
    for (const sentence of [...facts, ...entry.body]) {
      expect(sentence).not.toContain('비어 있는 채로 시작')
      expect(sentence, sentence).toMatch(/니다\.$/)
    }
  })
})
