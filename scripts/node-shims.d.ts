// @types/node 없이 테스트가 쓰는 최소한의 node 모듈 선언
declare module 'node:fs' {
  const fs: {
    existsSync(path: string): boolean
    statSync(path: string): { size: number }
    readFileSync(path: string, encoding: 'utf8'): string
  }
  export default fs
}
declare module 'node:path' {
  const path: { resolve(...parts: string[]): string }
  export default path
}
