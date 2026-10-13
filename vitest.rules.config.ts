import { defineConfig } from 'vitest/config'

// 에뮬레이터가 필요한 테스트. npm test에는 포함하지 않고 npm run test:rules로만 돈다.
export default defineConfig({
  test: { include: ['tests-rules/**/*.test.ts'], environment: 'node', testTimeout: 30_000, fileParallelism: false },
})
