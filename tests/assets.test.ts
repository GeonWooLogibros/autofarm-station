import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS } from '../scripts/fetch-assets.mjs'
import { KENNEY } from '../scripts/fetch-kenney.mjs'
import { crateSprite, plantStage, CRATE_SPRITES } from '../src/ui/sprites'

describe('에셋', () => {
  test('목록의 파일이 모두 있고 비어 있지 않다', () => {
    for (const name of Object.keys(ASSETS)) {
      const p = path.resolve('src/assets/codmos', name)
      expect(fs.existsSync(p), name).toBe(true)
      expect(fs.statSync(p).size, name).toBeGreaterThan(100)
    }
  })

  test('SVG에 스크립트나 외부 주소가 없다', () => {
    for (const name of Object.keys(ASSETS).filter(n => n.endsWith('.svg'))) {
      const text = fs.readFileSync(path.resolve('src/assets/codmos', name), 'utf8')
      expect(/<script|<foreignObject|[\s"']on[a-z]+\s*=|href\s*=\s*["']?\s*(https?:|\/\/)|javascript:/i.test(text), name).toBe(false)
    }
  })

  test('SOURCES.md에 모든 에셋 ID가 적혀 있다', () => {
    const doc = fs.readFileSync(path.resolve('assets/SOURCES.md'), 'utf8')
    for (const [name, id] of Object.entries(ASSETS)) expect(doc.includes(id as string), name).toBe(true)
  })

  test('Kenney 묶음에서 가져온 파일이 모두 있고, SVG에 스크립트나 외부 주소가 없다', () => {
    for (const name of Object.keys(KENNEY)) {
      const p = path.resolve('src/assets/kenney', name)
      expect(fs.existsSync(p), name).toBe(true)
      expect(fs.statSync(p).size, name).toBeGreaterThan(100)
      if (!name.endsWith('.svg')) continue
      const text = fs.readFileSync(p, 'utf8')
      expect(/<script|<foreignObject|<image|[\s"']on[a-z]+\s*=|href\s*=\s*["']?\s*(https?:|\/\/)|javascript:/i.test(text), name).toBe(false)
    }
  })

  test('SOURCES.md에 Kenney 파일의 이름과 묶음 안의 경로가 적혀 있다', () => {
    const doc = fs.readFileSync(path.resolve('assets/SOURCES.md'), 'utf8')
    for (const [name, from] of Object.entries(KENNEY)) {
      expect(doc.includes(`\`${name}\``), name).toBe(true)
      expect(doc.includes((from as { entry: string }).entry), name).toBe(true)
    }
    expect(doc.includes('CC0')).toBe(true)
  })

  test('성장 정도를 그림 단계로 바꾼다', () => {
    expect(plantStage(0)).toBe(0)
    expect(plantStage(0.2)).toBe(1)
    expect(plantStage(0.6)).toBe(2)
    expect(plantStage(0.99)).toBe(2)
    expect(plantStage(1)).toBe(3)
  })

  test('무게 0~9를 상자 그림 8종에 고르게 배정한다', () => {
    expect(CRATE_SPRITES.length).toBe(8)
    expect(crateSprite(0)).toBe(CRATE_SPRITES[0])
    expect(crateSprite(9)).toBe(CRATE_SPRITES[7])
    const used = new Set(Array.from({ length: 10 }, (_, w) => crateSprite(w)))
    expect(used.size).toBe(8)
  })
})
