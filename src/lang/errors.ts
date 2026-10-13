export type ErrorKind = 'syntax' | 'locked' | 'runtime'

// 외부 함수(드론 함수, 내장 함수)와 값 도우미가 플레이어에게 보여 줄 문장을 담아 던지는 오류.
// 실행기는 이 오류의 문장만 그대로 보여 주고, 그 밖의 Error는 프로그램의 버그로 보아 문장을 숨긴다.
export class HostError extends Error {}

export class LangError extends Error {
  constructor(message: string, public line: number, public kind: ErrorKind) {
    super(message)
  }
}
