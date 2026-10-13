import html from '../../index.html?raw'
import app from '../../src/ui/app.ts?raw'
import { describe, expect, test } from 'vitest'

describe('게임 이름', () => {
  test('문서 제목과 화면 머리글이 「오토팜 스테이션」이고 옛 이름은 남아 있지 않다', () => {
    expect(html).toContain('<title>오토팜 스테이션</title>')
    expect(app).toContain('<h1>오토팜 스테이션</h1>')
    expect(html + app).not.toContain('정원사는 대체되었다')
  })
})
