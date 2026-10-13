#!/usr/bin/env node
// Kenney(kenney.nl, CC0)의 묶음에서 이 게임이 화면 틀과 단추와 아이콘에 쓰는 파일을 src/assets/kenney/로 꺼내 온다.
// 사용법: node scripts/fetch-kenney.mjs
// 묶음(zip)은 임시 폴더에 내려받고, 아래 목록에 적힌 파일만 내용 그대로 복사한다. 묶음 안의 것은 아무것도 실행하지 않는다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OUT = path.resolve('src/assets/kenney')

// 묶음의 내려받기 주소는 소개 페이지 안에 있고 판이 바뀌면 달라지므로, 페이지에서 찾아 쓴다.
export const PACKS = {
  scifi: { name: 'UI Pack: Sci-Fi', page: 'https://kenney.nl/assets/ui-pack-sci-fi' },
  icons: { name: 'Game Icons', page: 'https://kenney.nl/assets/game-icons' },
}

// 저장할 이름 → 묶음과 묶음 안의 경로. 색이 다른 같은 이름의 파일은 앞에 색 이름을 붙여 구분한다.
export const KENNEY = {
  'panel_glass_screws.svg': { pack: 'scifi', entry: 'Vector/Extra/panel_glass_screws.svg' },
  'panel_glass.svg': { pack: 'scifi', entry: 'Vector/Extra/panel_glass.svg' },
  'button_rectangle_depth.svg': { pack: 'scifi', entry: 'Vector/Extra/button_rectangle_depth.svg' },
  'button_rectangle.svg': { pack: 'scifi', entry: 'Vector/Extra/button_rectangle.svg' },
  'bar_shadow_square_outline_large.svg': { pack: 'scifi', entry: 'Vector/Extra/bar_shadow_square_outline_large.svg' },
  'blue_bar_square_gloss_large.svg': { pack: 'scifi', entry: 'Vector/Blue/bar_square_gloss_large.svg' },
  'grey_bar_round_gloss_large_square.svg': { pack: 'scifi', entry: 'Vector/Grey/bar_round_gloss_large_square.svg' },
  'green_bar_round_gloss_large_square.svg': { pack: 'scifi', entry: 'Vector/Green/bar_round_gloss_large_square.svg' },
  'yellow_bar_round_gloss_large_square.svg': { pack: 'scifi', entry: 'Vector/Yellow/bar_round_gloss_large_square.svg' },
  'red_bar_round_gloss_large_square.svg': { pack: 'scifi', entry: 'Vector/Red/bar_round_gloss_large_square.svg' },
  'game_icons_sheet_white1x.png': { pack: 'icons', entry: 'Spritesheet/sheet_white1x.png' },
}

async function download(pack, dir) {
  const page = await fetch(pack.page, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!page.ok) throw new Error(`${pack.page}: HTTP ${page.status}`)
  const link = (await page.text()).match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"' ]+\.zip/)
  if (!link) throw new Error(`${pack.page}: 내려받기 주소를 찾지 못했습니다.`)
  const res = await fetch(link[0], { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${link[0]}: HTTP ${res.status}`)
  const file = path.join(dir, path.basename(link[0]))
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log(`${pack.name}: ${link[0]}`)
  return file
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kenney-'))
  fs.mkdirSync(OUT, { recursive: true })
  const zips = {}
  for (const [key, pack] of Object.entries(PACKS)) zips[key] = await download(pack, tmp)
  for (const [name, { pack, entry }] of Object.entries(KENNEY)) {
    // unzip -p는 파일 하나의 내용만 표준 출력으로 내보낸다.
    const data = execFileSync('unzip', ['-p', zips[pack], entry], { maxBuffer: 16 * 1024 * 1024 })
    if (data.length === 0) throw new Error(`${name}: 묶음에 ${entry} 파일이 없습니다.`)
    fs.writeFileSync(path.join(OUT, name), data)
    console.log(`${name} (${data.length} bytes)`)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}
