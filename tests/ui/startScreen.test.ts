import { describe, expect, test } from 'vitest'
import { SAVE_KEY, type StorageLike } from '../../src/progress/save'
import { hasMainSave, startLabel } from '../../src/ui/startScreen'

function storageWith(entries: Record<string, string>): StorageLike {
  return {
    getItem: key => (key in entries ? entries[key] : null),
    setItem: () => {},
    removeItem: () => {},
  }
}

describe('시작 화면의 첫 버튼', () => {
  test('저장 데이터가 있으면 이어하기, 없으면 시작하기이다', () => {
    expect(startLabel(true)).toBe('이어하기')
    expect(startLabel(false)).toBe('시작하기')
  })

  test('본편의 저장 키에 값이 있는지만 본다', () => {
    expect(hasMainSave(storageWith({ [SAVE_KEY]: '{"version":1}' }))).toBe(true)
    expect(hasMainSave(storageWith({}))).toBe(false)
    expect(hasMainSave(storageWith({ 'gardener-replaced:challenges:v1': '{}' }))).toBe(false)
    expect(hasMainSave(storageWith({ [SAVE_KEY]: '' }))).toBe(false)
  })

  test('저장소를 읽다가 예외가 나면 저장이 없는 것으로 본다', () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error('읽을 수 없습니다.') },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(hasMainSave(broken)).toBe(false)
  })
})
