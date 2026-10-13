import { describe, expect, test } from 'vitest'
import { run } from './helpers'
import { compile } from '../../src/lang'
import { ALL_FEATURES } from '../../src/lang/checker'
import { parseSource } from '../../src/lang/parser'
import { LangError } from '../../src/lang/errors'
import { constant, host, type Value } from '../../src/lang/values'

// 입문자가 흔히 하는 실수에 원인을 짚어 주는 안내가 나오는지 확인한다.
const drone = (): Record<string, Value> => ({
  Right: constant('Right'),
  Daisy: constant('Daisy'),
  harvest: host('harvest', 200, 0, 0, () => true),
  can_harvest: host('can_harvest', 1, 0, 0, () => true),
  move: host('move', 200, 1, 1, () => true),
  get_water: host('get_water', 1, 0, 0, () => 0.5),
  get_plant_type: host('get_plant_type', 1, 0, 0, () => constant('Daisy')),
})
const message = (src: string): string => {
  const r = run(src, drone()).result
  expect(r.status, src).toBe('error')
  return r.error!.message
}
const syntax = (src: string): LangError => {
  try { parseSource(src) } catch (e) { return e as LangError }
  throw new Error(`오류가 발생하지 않았습니다: ${src}`)
}

describe('대소문자를 틀린 이름', () => {
  test('상수와 함수 이름의 대소문자를 틀리면 올바른 이름을 알려 준다', () => {
    expect(message('move(right)')).toContain('Right')
    expect(message('move(RIGHT)')).toContain('Right')
    expect(message('Harvest()')).toContain('harvest')
    expect(message('Move(Right)')).toContain('move')
    expect(message('print(daisy)')).toContain('Daisy')
  })

  test('true, false, none은 True, False, None을 알려 준다', () => {
    expect(message('while true:\n    harvest()')).toContain('True')
    expect(message('x = false')).toContain('False')
    expect(message('x = none')).toContain('None')
  })

  test('직접 만든 변수와 함수 안의 변수도 제안한다', () => {
    expect(message('count = 1\nprint(Count)')).toContain(': count')
    expect(message('def f(size):\n    return Size\nf(1)')).toContain(': size')
  })

  test('대소문자만 다른 이름이 없으면 제안하지 않는다', () => {
    const m = message('harvst()')
    expect(m).toContain("'harvst'라는 이름을 찾을 수 없습니다.")
    expect(m).toContain('철자')
  })

  test('후보가 둘 이상이면 제안하지 않는다', () => {
    expect(message('ab = 1\nAB = 2\nprint(Ab)')).toContain('철자')
  })

  test('줄 번호는 틀린 이름이 있는 줄이다', () => {
    const r = run('harvest()\nmove(right)', drone()).result
    expect(r.line).toBe(2)
  })

  test('잠긴 함수의 이름도 제안한다', () => {
    const r = compile('Move(Right)', {
      features: new Set(ALL_FEATURES),
      featureTitles: { loop: '', cond: '', var: '', func: '', for: '', list: '', dict: '' },
      globals: new Map<string, Value>([['Right', constant('Right')]]),
      lockedNames: new Map([['move', '선반 확장 1']]),
    })
    if (!r.ok) throw new Error('컴파일에 실패했습니다')
    expect(r.program.step(1000).error!.message).toContain(': move')
  })

  test('혼자 쓰는 키워드의 대소문자를 틀려도 알려 준다', () => {
    expect(message('while True:\n    Break')).toContain(': break')
    expect(message('Pass')).toContain(': pass')
  })
})

describe('괄호를 빠뜨린 함수', () => {
  test('함수 이름만 적은 줄은 괄호가 필요하다고 알려 준다', () => {
    const m = message('harvest')
    expect(m).toContain('괄호')
    expect(m).toContain('harvest()')
  })

  test('직접 만든 함수도 같다', () => {
    expect(message('def tend():\n    harvest()\ntend')).toContain('tend()')
  })

  test('조건에 함수 이름만 적으면 알려 준다', () => {
    expect(message('if can_harvest:\n    harvest()')).toContain('can_harvest()')
    expect(message('while can_harvest:\n    harvest()')).toContain('can_harvest()')
    expect(message('if False:\n    harvest()\nelif can_harvest:\n    harvest()')).toContain('can_harvest()')
  })

  test('함수 이름을 값과 비교하거나 계산해도 알려 준다', () => {
    expect(message('if get_water < 0.5:\n    harvest()')).toContain('get_water()')
    expect(message('if can_harvest == True:\n    harvest()')).toContain('can_harvest()')
    expect(message('x = get_water + 1')).toContain('get_water()')
  })

  test('함수끼리 같은지 비교하거나 변수에 담는 것은 오류가 아니다', () => {
    expect(run('f = harvest\nprint(f == harvest)\nf()', drone()).out).toEqual(['True'])
  })

  test('괄호 없이 값을 이어 쓰면 괄호를 넣은 모습을 보여 준다', () => {
    const e = syntax('harvest()\nmove Right')
    expect(e.line).toBe(2)
    expect(e.message).toContain('move(Right)')
    expect(syntax('print 3').message).toContain('print(3)')
  })
})

// 괄호를 빠뜨렸다는 안내는 함수를 만든 바로 그 이름을 적었을 때에만 한다.
// 매개변수나 변수에 담긴 함수는 파이썬과 같이 참인 값이고, 무엇과도 ==로 비교할 수 있다.
describe('함수를 값으로 다루는 올바른 코드', () => {
  const counting = () => {
    let calls = 0
    const globals = { ...drone(), harvest: host('harvest', 200, 0, 0, () => { calls++; return true }) }
    return { globals, calls: () => calls }
  }
  const ok = (src: string, globals: Record<string, Value> = drone()): string[] => {
    const r = run(src, globals)
    expect(r.result.status, `${src}: ${r.result.error?.message ?? ''}`).toBe('done')
    return r.out
  }

  test('직접 만든 함수를 None과 비교할 수 있다', () => {
    expect(ok('def g():\n    return 0\nprint(g == None)\nprint(g != None)\nprint(None == g)\nprint(g is not None)')).toEqual(['False', 'True', 'False', 'True'])
    expect(ok('print(harvest == None)\nprint(harvest is None)')).toEqual(['False', 'False'])
  })

  test('매개변수로 받은 함수를 None과 비교한 뒤에 호출할 수 있다', () => {
    const c = counting()
    ok('def f(cb):\n    if cb is not None:\n        cb()\nf(harvest)\nf(None)', c.globals)
    expect(c.calls()).toBe(1)
  })

  test('매개변수로 받은 함수는 조건에서 참이다', () => {
    const c = counting()
    ok('def f(cb):\n    if cb:\n        cb()\nf(harvest)\nf(None)', c.globals)
    expect(c.calls()).toBe(1)
  })

  test('변수에 담은 함수도 조건, not, ==에서 파이썬과 같이 동작한다', () => {
    const src = [
      'def my_func():', '    return 1', 'cb = my_func',
      'if cb:', '    print(1)',
      'while cb:', '    print(2)', '    break',
      'print(not cb)', 'print(cb == True)', 'print(cb != 3)', 'print(cb == my_func)',
      'cb',
      'cb = harvest', 'if cb:', '    print(3)', 'print(not cb)',
    ].join('\n')
    expect(ok(src)).toEqual(['1', '2', 'False', 'False', 'True', 'True', '3', 'False'])
  })

  test('함수를 만든 이름을 그대로 조건에 적으면 여전히 알려 준다', () => {
    expect(message('if can_harvest:\n    harvest()')).toContain('can_harvest()')
    expect(message('while can_harvest:\n    harvest()')).toContain('can_harvest()')
    expect(message('if can_harvest == True:\n    harvest()')).toContain('can_harvest()')
    expect(message('if True == can_harvest:\n    harvest()')).toContain('can_harvest()')
    expect(message('if can_harvest != False:\n    harvest()')).toContain('can_harvest()')
    expect(message('harvest')).toContain('harvest()')
    expect(message('def my_func():\n    return 1\nif my_func:\n    harvest()')).toContain('my_func()')
    expect(message('def my_func():\n    return 1\nmy_func')).toContain('my_func()')
  })

  test('not 뒤에 함수 이름만 적어도 알려 준다', () => {
    expect(message('if not can_harvest:\n    harvest()')).toContain('can_harvest()')
    expect(message('x = not can_harvest')).toContain('can_harvest()')
  })

  test('안내의 줄 번호는 이름을 적은 줄이다', () => {
    expect(run('harvest()\nif not can_harvest:\n    harvest()', drone()).result.line).toBe(2)
  })
})

describe('따옴표를 붙인 상수', () => {
  test('상수를 같은 이름의 문자열과 비교하면 따옴표를 빼라고 알려 준다', () => {
    const m = message('if get_plant_type() == "Daisy":\n    harvest()')
    expect(m).toContain('따옴표')
    expect(m).toContain('Daisy')
    expect(message('if "daisy" != get_plant_type():\n    harvest()')).toContain('따옴표')
  })

  test('이름이 다른 문자열과 비교하는 것은 오류가 아니다', () => {
    expect(run('print(get_plant_type() == "hello")', drone()).out).toEqual(['False'])
  })
})

describe('키워드와 조건을 잘못 쓴 줄', () => {
  test('대문자로 시작한 키워드는 소문자로 쓰라고 알려 준다', () => {
    expect(syntax('While True:\n    harvest()').message).toContain(': while')
    expect(syntax('If can_harvest():\n    harvest()').message).toContain(': if')
    expect(syntax('if can_harvest():\n    harvest()\nElse:\n    harvest()').message).toContain(': else')
    expect(syntax('For i in range(3):\n    harvest()').message).toContain(': for')
    expect(syntax('Def f():\n    harvest()').message).toContain(': def')
    expect(syntax('if True And False:\n    harvest()').message).toContain(': and')
  })

  test('대문자로 시작한 키워드의 줄 번호를 알려 준다', () => {
    expect(syntax('harvest()\nWhile True:\n    harvest()').line).toBe(2)
  })

  test('키워드와 철자가 같은 변수에 값을 넣는 것은 막지 않는다', () => {
    expect(run('If = 3\nprint(If)\nWhile = [1]\nprint(While[0])').out).toEqual(['3', '1'])
  })

  test('조건에 =를 쓰면 ==를 쓰라고 알려 준다', () => {
    const e = syntax('harvest()\nif can_harvest() = True:\n    harvest()')
    expect(e.line).toBe(2)
    expect(e.message).toContain('==')
    expect(syntax('while x = 3:\n    harvest()').message).toContain('==')
  })

  test('=<와 =>는 <=와 >=로 쓰라고 알려 준다', () => {
    expect(syntax('if get_water() =< 0.5:\n    harvest()').message).toContain('<=')
    expect(syntax('if get_water() => 0.5:\n    harvest()').message).toContain('>=')
  })

  test('조건이 없으면 조건이 필요하다고 알려 준다', () => {
    expect(syntax('while:\n    harvest()').message).toContain('조건')
    expect(syntax('if:\n    harvest()').message).toContain('조건')
    expect(syntax('if True:\n    harvest()\nelif:\n    harvest()').message).toContain('조건')
  })
})

describe('그 밖에 입문자가 자주 틀리는 것', () => {
  test('함수가 아닌 값을 호출했는데 대소문자만 다른 함수가 있으면 알려 준다', () => {
    const r = run('Water()', { Water: constant('Water'), water: host('water', 200, 0, 0, () => true) }).result
    expect(r.error!.message).toContain('함수가 아닙니다')
    expect(r.error!.message).toContain(': water')
  })

  test('대소문자만 다른 함수가 없으면 원래 안내만 한다', () => {
    const m = message('Right()')
    expect(m).toContain('함수가 아닙니다')
    expect(m).not.toContain('고쳐')
  })

  test('조건에 쉼표를 쓰면 소수점을 쓰라고 알려 준다', () => {
    const e = syntax('if get_water() < 0,5:\n    harvest()')
    expect(e.message).toContain('쉼표')
    expect(e.message).toContain('0.5')
  })

  test('계산만 하고 값을 쓰지 않는 줄은 저장하는 방법을 알려 준다', () => {
    const e = syntax('x = 0\nx + 1')
    expect(e.line).toBe(2)
    expect(e.message).toContain('x += 1')
    expect(syntax('x = 0\nx * 2 + 1').message).toContain('=')
  })

  test('비교만 하고 값을 쓰지 않는 줄은 =를 쓰라고 알려 준다', () => {
    const e = syntax('x == 3')
    expect(e.message).toContain('==')
    expect(e.message).toContain('x = 3')
  })

  test('=+는 +=로 쓰라고 알려 준다', () => {
    expect(syntax('x = 0\nx =+ 1').message).toContain('x += 1')
  })

  test('함수 호출만 있는 줄과 값을 쓰는 계산은 그대로 실행된다', () => {
    expect(run('x = 1 + 2\nprint(x * 2)\nprint(x == 3)\nharvest()', drone()).out).toEqual(['6', 'True'])
  })
})
