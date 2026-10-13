import { defineConfig } from 'vitest/config'

export default defineConfig({
  // 배포는 HTML 파일 하나로 하므로(../tools/build-artifact.mjs), 그림과 소리를 모두 data URI로 스크립트 안에 넣는다.
  build: { assetsInlineLimit: 10_000_000, chunkSizeWarningLimit: 4000 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
