import { describe, expect, test } from 'vitest'
import { run } from './helpers'
import { host, constant, display, keyOf, repr, truthy, typeName, type Value } from '../../src/lang/values'
import { HostError, LangError } from '../../src/lang/errors'
import { parseSource } from '../../src/lang/parser'
import { Program } from '../../src/lang/interpreter'

describe('이름 조회 오류', () => {
  test('대소문자만 다른 이름이 있으면 제안한다', () => {
    const r = run('print(right)', { Right: constant('Right') }).result
    expect(r.error!.message).toContain('Right')
  })
})

describe('식과 변수', () => {
  test('산술 연산', () => {
    expect(run('print(1 + 2 * 3)\nprint(7 // 2)\nprint(7 / 2)\nprint(2 ** 10)\nprint(-7 % 3)\nprint(-7 // 2)').out)
      .toEqual(['7', '3', '3.5', '1024', '2', '-4'])
  })

  test('변수와 복합 대입', () => {
    expect(run('x = 3\nx += 2\nx *= 4\nprint(x)').out).toEqual(['20'])
  })

  test('비교와 논리 연산', () => {
    expect(run('print(1 < 2 < 3)\nprint(1 < 2 > 5)\nprint(not True or False)\nprint(None == None)\nprint(1 == True)').out)
      .toEqual(['True', 'False', 'False', 'True', 'False'])
  })

  test('and와 or는 필요한 만큼만 계산한다', () => {
    let calls = 0
    const f = host('f', 1, 0, 0, () => { calls++; return true })
    run('x = False and f()\ny = True or f()', { f })
    expect(calls).toBe(0)
  })

  test('문자열 이어 붙이기와 출력', () => {
    expect(run('print("딸기 " + "수확")\nprint([1, "a", None, True])').out).toEqual(['딸기 수확', "[1, 'a', None, True]"])
  })
})

describe('흐름 제어', () => {
  test('if / elif / else', () => {
    expect(run('x = 5\nif x < 3:\n    print("a")\nelif x < 10:\n    print("b")\nelse:\n    print("c")').out).toEqual(['b'])
  })

  test('while, break, continue', () => {
    const src = 'i = 0\nwhile True:\n    i += 1\n    if i == 2:\n        continue\n    if i > 4:\n        break\n    print(i)'
    expect(run(src).out).toEqual(['1', '3', '4'])
  })

  test('for와 range', () => {
    expect(run('for i in range(3):\n    print(i)').out).toEqual(['0', '1', '2'])
    expect(run('for i in range(2, 5):\n    print(i)').out).toEqual(['2', '3', '4'])
    expect(run('for i in range(5, 0, -2):\n    print(i)').out).toEqual(['5', '3', '1'])
  })
})

describe('함수', () => {
  test('정의, 호출, 반환값', () => {
    expect(run('def add(a, b):\n    return a + b\nprint(add(2, 3))').out).toEqual(['5'])
  })

  test('return이 없으면 None을 돌려준다', () => {
    expect(run('def f():\n    pass\nprint(f())').out).toEqual(['None'])
  })

  test('함수 안의 대입은 지역 변수이고, global을 쓰면 전역 변수를 바꾼다', () => {
    expect(run('n = 1\ndef f():\n    n = 5\nf()\nprint(n)').out).toEqual(['1'])
    expect(run('n = 1\ndef g():\n    global n\n    n = 5\ng()\nprint(n)').out).toEqual(['5'])
  })

  test('함수 안에서 전역 변수를 읽을 수 있다', () => {
    expect(run('n = 7\ndef f():\n    return n + 1\nprint(f())').out).toEqual(['8'])
  })

  test('재귀', () => {
    expect(run('def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\nprint(fact(5))').out).toEqual(['120'])
  })

  test('반복 안에서 return하면 함수가 끝난다', () => {
    expect(run('def f():\n    while True:\n        return 3\nprint(f())').out).toEqual(['3'])
  })
})

describe('리스트, 튜플, 딕셔너리', () => {
  test('리스트 인덱싱과 메서드', () => {
    const src = 'a = [3, 1]\na.append(2)\na.insert(0, 9)\nprint(a)\nprint(a.pop())\na.remove(9)\nprint(a)\nprint(a[-1])\nprint(len(a))\na[0] = 7\nprint(a)'
    expect(run(src).out).toEqual(['[9, 3, 1, 2]', '2', '[3, 1]', '1', '2', '[7, 1]'])
  })

  test('min, max, abs, in', () => {
    expect(run('a = [4, 9, 2]\nprint(max(a))\nprint(min(a))\nprint(max(3, 8))\nprint(abs(-4))\nprint(9 in a)\nprint(5 not in a)').out)
      .toEqual(['9', '2', '8', '4', 'True', 'True'])
  })

  test('리스트는 같은 객체를 가리킨다', () => {
    expect(run('a = [1]\nb = a\nb.append(2)\nprint(a)').out).toEqual(['[1, 2]'])
  })

  test('튜플은 값으로 비교하고 딕셔너리의 키가 된다', () => {
    expect(run('p = (1, 2)\nprint(p == (1, 2))\nprint(p[1])\nd = {}\nd[p] = "여기"\nprint(d[(1, 2)])').out).toEqual(['True', '2', '여기'])
  })

  test('딕셔너리 조회, 대입, in, 순회', () => {
    const src = 'd = {"a": 1}\nd["b"] = 2\nprint(d["a"] + d["b"])\nprint("a" in d)\nfor k in d:\n    print(k)\nprint(len(d))'
    expect(run(src).out).toEqual(['3', 'True', 'a', 'b', '2'])
  })

  test('상수는 서로 비교할 수 있고 딕셔너리의 키가 된다', () => {
    const src = 'print(a == b)\nprint(a == a)\nd = {a: 1}\nprint(d[a])'
    expect(run(src, { a: constant('Daisy'), b: constant('Tulip') }).out).toEqual(['False', 'True', '1'])
  })
})

describe('실행 중 오류', () => {
  const err = (src: string, extra: Record<string, Value> = {}) => run(src, extra).result

  test('없는 이름', () => {
    const r = err('x = 1\nprint(y)')
    expect(r.status).toBe('error')
    expect(r.line).toBe(2)
    expect(r.error!.kind).toBe('runtime')
    expect(r.error!.message).toContain("'y'")
  })

  test('0으로 나누기, 인덱스 범위, 없는 키', () => {
    expect(err('x = 1 / 0').error!.message).toContain('0으로 나눌 수 없습니다')
    expect(err('a = [1]\nprint(a[3])').error!.message).toContain('범위')
    expect(err('d = {}\nprint(d["k"])').error!.message).toContain('키')
  })

  test('자료형이 맞지 않는 연산', () => {
    expect(err('x = 1 + "a"').error!.message).toContain('숫자')
    expect(err('x = 3\nx()').error!.message).toContain('함수가 아닙니다')
  })

  test('인자 개수가 맞지 않는 호출', () => {
    expect(err('def f(a):\n    pass\nf()').error!.message).toContain('인자')
    expect(err('f(1, 2)', { f: host('f', 1, 0, 1, () => null) }).error!.message).toContain('인자')
  })

  test('재귀가 200단계를 넘으면 오류이다', () => {
    const r = err('def f():\n    f()\nf()')
    expect(r.status).toBe('error')
    expect(r.error!.message).toContain('너무 깊')
  })

  test('외부 함수가 플레이어에게 알리려고 던진 오류(HostError)는 그 문장에 줄 번호를 붙여 보여 준다', () => {
    const r = err('x = 1\nboom()', { boom: host('boom', 1, 0, 0, () => { throw new HostError('고장') }) })
    expect(r.line).toBe(2)
    expect(r.error!.message).toBe('고장')
    expect(r.error!.kind).toBe('runtime')
  })

  test('외부 함수에서 난 그 밖의 오류는 영어 문장을 보여 주지 않고, 원래 오류는 cause에 남긴다', () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'plant')")
    const r = err('x = 1\nboom()', { boom: host('boom', 1, 0, 0, () => { throw bug }) })
    expect(r.line).toBe(2)
    expect(r.error!.kind).toBe('runtime')
    expect(r.error!.message).toBe('실행 중에 예상하지 못한 문제가 발생했습니다. 코드를 조금 바꿔서 다시 실행해 주세요.')
    expect(r.error!.cause).toBe(bug)
  })

  test('내장 함수와 값 도우미의 안내는 그대로 보인다', () => {
    expect(err('len(3)').error!.message).toContain('len()')
    expect(err('d = {}\nd[[1]] = 2').error!.message).toContain('키로 사용할 수 없습니다')
    expect(err('max([])').error!.cause).toBeUndefined()
  })

  test('튜플의 범위를 벗어나면 튜플이라고 알려 준다', () => {
    expect(err('t = (1, 2)\nprint(t[2])').error!.message).toBe('튜플의 범위를 벗어났습니다. (길이 2, 번호 2)')
    expect(err('a = [1, 2]\nprint(a[2])').error!.message).toBe('리스트의 범위를 벗어났습니다. (길이 2, 번호 2)')
    expect(err('a = [1]\na.pop(3)').error!.message).toContain('리스트의 범위')
  })

  test('range()는 한 번에 10000개까지만 만든다', () => {
    expect(run('print(len(range(10000)))').out).toEqual(['10000'])
    const m = err('range(10001)').error!.message
    expect(m).toContain('range()')
    expect(m).toContain('10000')
    expect(err('range(0, 100000, 2)').status).toBe('error')
    expect(run('print(len(range(0, 20000, 2)))').out).toEqual(['10000'])
  })

  test('이어 붙여 만드는 리스트와 문자열도 10000개를 넘지 못한다', () => {
    expect(run('a = range(5000)\nb = a + a\nprint(len(b))').out).toEqual(['10000'])
    expect(err('a = range(5001)\nb = a + a').error!.message).toBe('리스트가 너무 길어졌습니다. 한 번에 10000개까지만 담을 수 있습니다.')
    const doubling = 's = "ab"\nfor i in range(20):\n    s = s + s'
    const r = err(doubling)
    expect(r.error!.message).toBe('문자열이 너무 길어졌습니다. 10000자까지만 만들 수 있습니다.')
    expect(r.line).toBe(3)
  })

  test('함수 안에서 바깥 변수에 += 를 쓰면 global이 필요하다고 알려 준다', () => {
    const r = err('count = 0\ndef add():\n    count += 1\nadd()')
    expect(r.line).toBe(3)
    expect(r.error!.kind).toBe('runtime')
    expect(r.error!.message).toContain('global count')
    expect(r.error!.message).toContain("'count'")
  })

  test('global을 적었거나, 함수 안에서 만든 변수이거나, 함수 밖이면 += 를 쓸 수 있다', () => {
    expect(run('count = 0\ndef add():\n    global count\n    count += 1\nadd()\nadd()\nprint(count)').out).toEqual(['2'])
    expect(run('count = 5\ndef add():\n    count = 1\n    count += 1\n    return count\nprint(add())\nprint(count)').out).toEqual(['2', '5'])
    expect(run('def add(count):\n    count += 1\n    return count\nprint(add(3))').out).toEqual(['4'])
    expect(run('count = 0\ncount += 1\nprint(count)').out).toEqual(['1'])
    // 바깥 리스트의 칸을 바꾸는 것은 이름에 대입하는 것이 아니므로 global 없이도 된다.
    expect(run('a = [1]\ndef add():\n    a[0] += 1\nadd()\nprint(a)').out).toEqual(['[2]'])
  })

  test('어디에도 없는 이름에 += 를 쓰면 이름을 찾을 수 없다고 알려 준다', () => {
    expect(err('def add():\n    count += 1\nadd()').error!.message).toContain("'count'라는 이름을 찾을 수 없습니다")
  })

  test('함수 밖의 return, 반복 밖의 break', () => {
    expect(err('return 1').error!.message).toContain('함수 안')
    expect(err('break').error!.message).toContain('반복 안')
  })

  test('range가 지나치게 크면 오류이다', () => {
    expect(err('for i in range(10 ** 9):\n    pass').error!.message).toContain('너무')
  })
})

describe('틱 예산', () => {
  const act = (log: string[]) => host('act', 200, 0, 0, () => { log.push('act'); return true })

  test('무한 반복은 예산만큼만 실행하고 running을 돌려준다', () => {
    const p = new Program(parseSource('while True:\n    pass'), new Map())
    const r = p.step(1000)
    expect(r.status).toBe('running')
  })

  test('동작 하나는 200틱을 쓰고, 부족한 틱은 다음 호출에서 갚는다', () => {
    const log: string[] = []
    const p = new Program(parseSource('while True:\n    act()'), new Map([['act', act(log)]]))
    p.step(10)                       // 첫 동작은 곧바로 실행하고 빚이 생긴다
    expect(log.length).toBe(1)
    for (let i = 0; i < 15; i++) p.step(10)   // 150틱: 아직 빚을 갚는 중
    expect(log.length).toBe(1)
    for (let i = 0; i < 10; i++) p.step(10)   // 합계 260틱: 두 번째 동작
    expect(log.length).toBe(2)
  })

  test('프로그램이 끝나면 done을 돌려주고, 다시 호출해도 done이다', () => {
    const p = new Program(parseSource('x = 1'), new Map())
    expect(p.step(100).status).toBe('done')
    expect(p.step(100).status).toBe('done')
  })

  test('빈 프로그램은 곧바로 done이다', () => {
    expect(new Program(parseSource('# 주석만'), new Map()).step(10).status).toBe('done')
  })

  test('line은 지금 실행 중인 문장의 줄이다', () => {
    const log: string[] = []
    const p = new Program(parseSource('x = 1\nact()\ny = 2'), new Map([['act', act(log)]]))
    const r = p.step(5)
    expect(r.line).toBe(2)
  })

  test('stepStatement는 문장 하나만 실행한다', () => {
    const lines: string[] = []
    const print = host('print', 1, 1, 1, a => { lines.push(String(a[0])); return null })
    const p = new Program(parseSource('print(1)\nprint(2)\nprint(3)'), new Map([['print', print]]))
    p.stepStatement()
    expect(lines).toEqual(['1'])
    p.stepStatement()
    expect(lines).toEqual(['1', '2'])
    expect(p.stepStatement().status).toBe('done')
    expect(lines).toEqual(['1', '2', '3'])
    expect(p.stepStatement().status).toBe('done')
  })
})

// ---- 아래는 계획서의 테스트가 다루지 않는 규칙을 보탠 것이다 ----

describe('값 도우미', () => {
  test('constant는 같은 이름에 같은 객체를 돌려준다', () => {
    expect(constant('Daisy')).toBe(constant('Daisy'))
    expect(constant('Daisy')).not.toBe(constant('Tulip'))
  })

  test('truthy', () => {
    const empty: Value[] = [false, null, 0, '', { k: 'list', items: [] }, { k: 'tuple', items: [] }, { k: 'dict', map: new Map() }]
    for (const v of empty) expect(truthy(v)).toBe(false)
    const full: Value[] = [true, 1, 'a', { k: 'list', items: [0] }, constant('Daisy')]
    for (const v of full) expect(truthy(v)).toBe(true)
  })

  test('repr, display, typeName', () => {
    expect(repr('a')).toBe("'a'")
    expect(display('a')).toBe('a')
    expect(repr({ k: 'tuple', items: [1] })).toBe('(1,)')
    expect(repr({ k: 'tuple', items: [1, 'b'] })).toBe("(1, 'b')")
    expect(repr(constant('Daisy'))).toBe('Daisy')
    expect(repr(host('move', 200, 1, 1, () => null))).toBe('<함수 move>')
    const kinds: Value[] = [1, true, null, 'a', { k: 'list', items: [] }, { k: 'tuple', items: [] }, { k: 'dict', map: new Map() }, host('f', 1, 0, 0, () => null), constant('Daisy')]
    expect(kinds.map(typeName)).toEqual(['숫자', '참/거짓', 'None', '문자열', '리스트', '튜플', '딕셔너리', '함수', '상수'])
  })

  test('keyOf는 자료형이 다르면 겹치지 않고, 리스트는 키가 될 수 없다', () => {
    expect(keyOf(1)).not.toBe(keyOf('1'))
    expect(keyOf(1)).not.toBe(keyOf(true))
    expect(keyOf({ k: 'tuple', items: [1, 2] })).toBe(keyOf({ k: 'tuple', items: [1, 2] }))
    expect(keyOf({ k: 'tuple', items: ['1,2'] })).not.toBe(keyOf({ k: 'tuple', items: ['1', '2'] }))
    expect(keyOf({ k: 'tuple', items: [{ k: 'tuple', items: [1] }, 2] })).not.toBe(keyOf({ k: 'tuple', items: [{ k: 'tuple', items: [1, 2] }] }))
    expect(keyOf({ k: 'tuple', items: [] })).not.toBe(keyOf({ k: 'tuple', items: [''] }))
    // 겹친 깊이에 따라 키가 급격히 길어지지 않는다.
    let nested: Value = 1
    for (let i = 0; i < 30; i++) nested = { k: 'tuple', items: [nested] }
    expect(keyOf(nested).length).toBeLessThan(1000)
    expect(() => keyOf({ k: 'list', items: [] })).toThrow('딕셔너리의 키로 사용할 수 없습니다')
    expect(() => keyOf({ k: 'tuple', items: [{ k: 'list', items: [] }] })).toThrow('딕셔너리의 키로 사용할 수 없습니다')
  })

  test('자기 자신을 담은 리스트도 출력할 수 있다', () => {
    expect(run('a = [1]\na.append(a)\nprint(a)').out).toEqual(['[1, [...]]'])
  })
})

describe('식 (추가)', () => {
  test('리스트끼리, 문자열끼리 이어 붙이면 새 값이 된다', () => {
    expect(run('a = [1]\nb = a + [2, 3]\nprint(b)\nprint(a)\nprint("a" + "b")').out).toEqual(['[1, 2, 3]', '[1]', 'ab'])
  })

  test('and와 or는 마지막으로 계산한 값을 돌려준다', () => {
    expect(run('print(0 or 5)\nprint(1 and "a")\nprint(None and 1)\nprint(not 0)').out).toEqual(['5', 'a', 'None', 'True'])
  })

  test('나눗셈 결과가 정수이면 소수점 없이 보여 준다', () => {
    expect(run('print(4 / 2)\nprint(-3)\nprint(2 ** 3 ** 2)\nprint(7 % -3)').out).toEqual(['2', '-3', '512', '-2'])
  })

  test('연속 비교는 가운데 식을 한 번만 계산한다', () => {
    let calls = 0
    const f = host('f', 1, 0, 0, () => { calls++; return 2 })
    expect(run('print(1 < f() < 3)\nprint(5 < 1 < f())', { f }).out).toEqual(['True', 'False'])
    expect(calls).toBe(1)
  })

  test('복합 대입은 리스트와 딕셔너리의 칸에도 쓸 수 있다', () => {
    expect(run('a = [1, 2]\na[1] += 5\nd = {"k": 1}\nd["k"] *= 4\nprint(a)\nprint(d)\ns = "a"\ns += "b"\nprint(s)').out)
      .toEqual(['[1, 7]', "{'k': 4}", 'ab'])
  })

  test('딕셔너리와 튜플 표시', () => {
    expect(run('print({"a": 1, (1, 2): [3]})\nprint((1,))\nprint(())').out).toEqual(["{'a': 1, (1, 2): [3]}", '(1,)', '()'])
  })
})

describe('흐름 제어 (추가)', () => {
  test('for는 튜플과 딕셔너리를 순회하고, 순회 중에 바뀐 내용은 반영하지 않는다', () => {
    expect(run('for v in (1, 2):\n    print(v)').out).toEqual(['1', '2'])
    expect(run('d = {"a": 1, (0, 1): 2}\nfor k in d:\n    d["새 키"] = 0\n    print(k)').out).toEqual(['a', '(0, 1)'])
    expect(run('a = [1, 2]\nfor v in a:\n    a.append(v)\nprint(a)').out).toEqual(['[1, 2, 1, 2]'])
  })

  test('for 안의 break와 continue, 끝난 뒤에 남는 변수', () => {
    expect(run('for i in range(10):\n    if i == 1:\n        continue\n    if i == 3:\n        break\n    print(i)\nprint(i)').out)
      .toEqual(['0', '2', '3'])
  })

  test('안쪽 반복의 break는 바깥 반복을 끝내지 않는다', () => {
    expect(run('for i in range(2):\n    while True:\n        break\n    print(i)').out).toEqual(['0', '1'])
  })
})

describe('함수 (추가)', () => {
  test('식 안에서 여러 번 호출한 함수의 값을 이어서 계산한다', () => {
    expect(run('def sq(n):\n    return n * n\nprint(sq(sq(2)) + sq(3))').out).toEqual(['25'])
  })

  test('매개변수와 for 변수는 지역 변수이다', () => {
    expect(run('a = 1\ni = 9\ndef f(a):\n    for i in range(2):\n        a += i\n    return a\nprint(f(10))\nprint(a)\nprint(i)').out)
      .toEqual(['11', '1', '9'])
  })

  test('최상위의 global은 아무 일도 하지 않고, 함수 안의 def는 지역 함수가 된다', () => {
    expect(run('global n\nn = 2\ndef outer():\n    def inner():\n        return n\n    return inner() + 1\nprint(outer())').out).toEqual(['3'])
    expect(run('def outer():\n    def inner():\n        pass\nouter()\ninner()').result.error!.message).toContain("'inner'")
  })

  test('199단계 재귀는 허용한다', () => {
    expect(run('def f(n):\n    if n <= 1:\n        return 1\n    return 1 + f(n - 1)\nprint(f(199))').out).toEqual(['199'])
  })

  test('함수를 값으로 넘길 수 있다', () => {
    expect(run('def twice(f, x):\n    return f(f(x))\ndef inc(x):\n    return x + 1\nprint(twice(inc, 1))\nprint(inc)').out).toEqual(['3', '<함수 inc>'])
  })
})

describe('실행 중 오류 (추가)', () => {
  const err = (src: string, extra: Record<string, Value> = {}) => run(src, extra).result

  test('함수 안에서 난 오류는 그 줄 번호를 알려 준다', () => {
    const r = err('def f():\n    x = 1\n    return x / 0\n\nf()')
    expect(r.status).toBe('error')
    expect(r.line).toBe(3)
    expect(r.error!.line).toBe(3)
    expect(r.error!.kind).toBe('runtime')
  })

  test('함수가 돌아온 뒤에 난 오류는 호출한 줄 번호를 알려 준다', () => {
    const r = run('def f():\n    return 0\n\nx = 1 / f()')
    expect(r.result.line).toBe(4)
    expect(r.program!.line).toBe(4)
  })

  test('오류가 난 뒤에는 다시 호출해도 같은 오류를 돌려준다', () => {
    const p = new Program(parseSource('x = 1\ny = z'), new Map())
    const r = p.step(100)
    expect(r.status).toBe('error')
    expect(r.error).toBeInstanceOf(LangError)
    expect(p.step(100)).toBe(r)
    expect(p.stepStatement()).toBe(r)
  })

  test('튜플의 값은 바꿀 수 없다', () => {
    expect(err('p = (1, 2)\np[0] = 5').error!.message).toBe('튜플의 값은 바꿀 수 없습니다.')
    expect(err('p = (1, 2)\np[0] += 5').error!.message).toBe('튜플의 값은 바꿀 수 없습니다.')
  })

  test('인덱스 오류', () => {
    expect(err('a = [1, 2]\nprint(a[-3])').error!.message).toBe('리스트의 범위를 벗어났습니다. (길이 2, 번호 -3)')
    expect(err('a = [1, 2]\na[2] = 0').error!.message).toContain('범위')
    expect(err('a = [1, 2]\nprint(a[0.5])').error!.message).toContain('정수')
    expect(err('a = [1, 2]\nprint(a[True])').error!.message).toContain('정수')
    expect(err('x = 3\nprint(x[0])').error!.message).toContain('숫자')
    expect(err('d = {}\nprint(d[(1, "a")])').error!.message).toBe("딕셔너리에 없는 키입니다: (1, 'a')")
  })

  test('리스트는 딕셔너리의 키가 될 수 없다', () => {
    const r = err('d = {}\nd[[1]] = 2')
    expect(r.line).toBe(2)
    expect(r.error!.message).toBe('리스트나 딕셔너리는 딕셔너리의 키로 사용할 수 없습니다.')
    expect(err('d = {[1]: 2}').error!.message).toContain('키로 사용할 수 없습니다')
    expect(err('d = {}\nprint([1] in d)').error!.message).toContain('키로 사용할 수 없습니다')
  })

  test('리스트 메서드 오류', () => {
    expect(err('a = []\na.pop()').error!.message).toBe('비어 있는 리스트에서는 꺼낼 수 없습니다.')
    expect(err('a = [1]\na.remove(2)').error!.message).toBe('리스트에 그 값이 없습니다.')
    expect(err('a = [1]\na.sort()').error!.message).toBe('사용할 수 없는 기능입니다: .sort()')
    expect(err('a = [1]\na.append()').error!.message).toContain('인자')
    expect(err('a = [1]\na.pop(5)').error!.message).toContain('범위')
    expect(err('d = {}\nd.append(1)').error!.message).toContain('리스트')
    expect(err('a = [1]\nb = a.append').error!.message).toContain('괄호')
  })

  test('pop과 insert는 번호를 받는다', () => {
    expect(run('a = [1, 2, 3]\nprint(a.pop(0))\nprint(a.pop(-1))\na.insert(5, 9)\na.insert(-1, 8)\nprint(a)').out).toEqual(['1', '3', '[2, 8, 9]'])
  })

  test('자료형이 맞지 않는 비교, 부호, in, for', () => {
    expect(err('x = 1 < "a"').error!.message).toBe('크기 비교는 숫자끼리만 할 수 있습니다. (숫자, 문자열)')
    expect(err('x = -"a"').error!.message).toContain('숫자')
    expect(err('x = 1 in 5').error!.message).toContain('in')
    expect(err('for i in 5:\n    pass').error!.message).toBe('for로 반복할 수 없는 값입니다.')
    expect(err('x = [1] + (2,)').error!.message).toBe("'+' 연산은 숫자끼리만 할 수 있습니다. (리스트, 튜플)")
    expect(err('x = True + 1').error!.message).toContain('참/거짓')
    expect(err('x = 5 % 0').error!.message).toBe('0으로 나눌 수 없습니다.')
    expect(err('x = 5 // 0').error!.message).toBe('0으로 나눌 수 없습니다.')
  })

  test('내장 함수 오류', () => {
    expect(err('range(1.5)').error!.message).toBe('range()에는 정수를 넣어야 합니다.')
    expect(err('range(0, 5, 0)').error!.message).toBe('range()의 간격은 0이 될 수 없습니다.')
    expect(err('range()').error!.message).toContain('인자')
    expect(err('len(3)').error!.message).toContain('len()')
    expect(err('max([])').error!.message).toContain('비어 있는')
    expect(err('min(1, "a")').error!.message).toBe('min()과 max()에는 숫자만 넣을 수 있습니다.')
    expect(err('abs("a")').error!.message).toBe('abs()에는 숫자를 넣어야 합니다.')
    expect(run('print(len("가나다"))\nprint(len((1, 2)))\nprint(len({}))\nprint(range(0))\nprint(range(3, 0))\nprint(min((4, 2)))').out)
      .toEqual(['3', '2', '0', '[]', '[]', '2'])
  })

  test('인자 개수 오류는 필요한 개수를 알려 준다', () => {
    expect(err('def f(a, b):\n    pass\nf(1)').error!.message).toBe('f()에 넣은 인자의 개수가 맞지 않습니다. (필요: 2, 넣은 개수: 1)')
    expect(err('f(1, 2)', { f: host('f', 1, 0, 1, () => null) }).error!.message).toBe('f()에 넣은 인자의 개수가 맞지 않습니다. (필요: 0~1, 넣은 개수: 2)')
  })

  test('함수 안의 반복 밖 break는 호출한 쪽의 반복을 끝내지 않고 오류가 된다', () => {
    const r = err('def f():\n    break\nwhile True:\n    f()')
    expect(r.status).toBe('error')
    expect(r.line).toBe(2)
    expect(r.error!.message).toContain('반복 안')
    expect(err('continue').error!.message).toContain('반복 안')
  })

  test('겹침이 지나치게 깊은 식은 예외가 아니라 실행 오류가 된다', () => {
    // 괄호 90겹, 겹마다 90개 항의 덧셈: 식 트리의 깊이가 8,000을 넘는다.
    const src = 'x = ' + '('.repeat(90) + '1' + (' + 1'.repeat(89) + ')').repeat(90)
    const r = run(src).result
    expect(r.status).toBe('error')
    expect(r.error).toBeInstanceOf(LangError)
    expect(r.error!.kind).toBe('runtime')
    expect(r.error!.message).toBe('식이 너무 복잡합니다. 여러 줄로 나누어 써 주세요.')
    expect(r.line).toBe(1)
  })

  test('구문 분석기가 허용하는 가장 긴 연산자 연쇄는 계산할 수 있다', () => {
    expect(run('print(1' + ' + 1'.repeat(100) + ')').out).toEqual(['101'])
  })

  test('JS 호출 깊이가 넘쳐도 예외가 아니라 실행 오류가 된다', () => {
    const deep = host('deep', 1, 0, 0, () => { const f = (): number => f() + 1; return f() })
    const r = run('x = 1\ndeep()', { deep }).result
    expect(r.status).toBe('error')
    expect(r.error).toBeInstanceOf(LangError)
    expect(r.error!.message).toBe('식이 너무 복잡합니다. 여러 줄로 나누어 써 주세요.')
    expect(r.line).toBe(2)
  })

  test('Firefox가 알리는 호출 깊이 초과(InternalError)도 같은 실행 오류가 된다', () => {
    const deep = host('deep', 1, 0, 0, () => {
      const e = new Error('too much recursion')
      e.name = 'InternalError'
      throw e
    })
    expect(run('deep()', { deep }).result.error!.message).toBe('식이 너무 복잡합니다. 여러 줄로 나누어 써 주세요.')
    const plain = host('deep', 1, 0, 0, () => { throw new Error('too much recursion') })
    expect(run('deep()', { deep: plain }).result.error!.message).toBe('식이 너무 복잡합니다. 여러 줄로 나누어 써 주세요.')
  })

  test('서로 자기 자신을 담은 두 리스트를 비교해도 예외가 아니라 실행 오류가 된다', () => {
    const r = run('a = []\na.append(a)\nb = []\nb.append(b)\nx = 1\nprint(a == b)').result
    expect(r.status).toBe('error')
    expect(r.error).toBeInstanceOf(LangError)
    expect(r.error!.kind).toBe('runtime')
    // 호출 깊이와 값의 크기 가운데 어느 한도에 먼저 닿는지는 JS 엔진에 따라 다르다.
    expect(['식이 너무 복잡합니다. 여러 줄로 나누어 써 주세요.', '값이 너무 커서 처리할 수 없습니다.']).toContain(r.error!.message)
    expect(r.line).toBe(6)
  })

  test('외부 함수가 Error가 아닌 값을 던져도 실행 오류로 끝나고, 다시 호출해도 같은 오류이다', () => {
    const boom = host('boom', 1, 0, 0, () => { throw '고장' })
    const p = new Program(parseSource('x = 1\nboom()\ny = 2'), new Map<string, Value>([['boom', boom]]))
    const r = p.step(100)
    expect(r.status).toBe('error')
    expect(r.line).toBe(2)
    expect(r.error).toBeInstanceOf(LangError)
    expect(r.error!.kind).toBe('runtime')
    expect(r.error!.message).toBe('실행 중에 예상하지 못한 문제가 발생했습니다. 코드를 조금 바꿔서 다시 실행해 주세요.')
    expect(r.error!.cause).toBe('고장')
    expect(p.step(100)).toBe(r)
    expect(p.stepStatement()).toBe(r)
    expect(p.line).toBe(2)
  })

  test('stepStatement에서 난 예상하지 못한 오류도 실행 오류로 끝난다', () => {
    const boom = host('boom', 1, 0, 0, () => { throw null })
    const p = new Program(parseSource('boom()'), new Map<string, Value>([['boom', boom]]))
    const r = p.stepStatement()
    expect(r.status).toBe('error')
    expect(r.error!.message).toContain('예상하지 못한 문제')
    expect(p.stepStatement()).toBe(r)
  })

  test('같은 값을 거듭 담아 지나치게 커진 값은 출력하거나 비교할 때 곧바로 오류가 된다', () => {
    const build = (name: string, open: string, close: string) => `${name} = ${open}1, 1${close}\nfor i in range(25):\n    ${name} = ${open}${name}, ${name}${close}\n`
    const cases = [
      build('a', '[', ']') + 'print(a)',
      build('a', '[', ']') + build('b', '[', ']') + 'print(a == b)',
      build('a', '[', ']') + build('b', '[', ']') + 'print(b in [a])',
      build('a', '[', ']') + build('b', '[', ']') + 'c = [a]\nc.remove(b)',
      build('a', '(', ')') + 'd = {a: 1}',
      build('a', '(', ')') + 'd = {}\nprint(d[a])',
    ]
    const started = Date.now()
    for (const src of cases) {
      const r = run(src).result
      expect(r.status).toBe('error')
      expect(r.error!.message).toBe('값이 너무 커서 처리할 수 없습니다.')
      expect(r.line).toBe(src.split('\n').length)
    }
    expect(Date.now() - started).toBeLessThan(500)
  })

  test('크기 한도 안의 값은 그대로 출력하고 비교한다', () => {
    expect(run('a = range(5000)\nb = range(5000)\nprint(a == b)\nprint(len(a))').out).toEqual(['True', '5000'])
    expect(run('a = [1]\nfor i in range(25):\n    a = [a, a]\nprint(a == a)').out).toEqual(['True'])
  })

  test('튜플의 번호가 정수가 아니면 튜플이라고 알려 준다', () => {
    expect(err('p = (1, 2)\nprint(p[0.5])').error!.message).toBe('튜플의 번호에는 정수를 넣어야 합니다. (숫자)')
    expect(err('a = [1, 2]\nprint(a["x"])').error!.message).toBe('리스트의 번호에는 정수를 넣어야 합니다. (문자열)')
    expect(err('a = [1, 2]\na.pop(0.5)').error!.message).toBe('리스트의 번호에는 정수를 넣어야 합니다. (숫자)')
  })

  test('이어 붙인 리스트나 문자열이 지나치게 길어지면 오류이다', () => {
    expect(err('a = [1]\nwhile True:\n    a = a + a').error!.message).toContain('너무')
    expect(err('s = "a"\nwhile True:\n    s += s').error!.message).toContain('너무')
  })
})

describe('틱 예산 (추가)', () => {
  const act = (log: string[]) => host('act', 200, 0, 0, () => { log.push('act'); return 1 })
  const prog = (src: string, log: string[]) => new Program(parseSource(src), new Map<string, Value>([['act', act(log)]]))

  test('식 안에서 이어지는 동작도 하나씩 200틱을 쓴다', () => {
    const log: string[] = []
    const p = prog('x = act() + act()\ny = x', log)
    expect(p.step(10).status).toBe('running')
    expect(log.length).toBe(1)
    for (let i = 0; i < 19; i++) p.step(10)      // 합계 200틱: 아직 첫 동작의 빚이 1틱 남았다
    expect(log.length).toBe(1)
    p.step(10)
    expect(log.length).toBe(2)
  })

  test('사용자 함수 안의 문장도 틱을 쓴다', () => {
    const p = new Program(parseSource('def f():\n    a = 1\n    b = 2\n    return a + b\nx = f()'), new Map())
    // def 1틱, x = f() 1틱, 함수 본문 3틱. 문장은 틱을 낸 뒤에 실행하므로 마지막 문장은 그다음 호출에서 끝난다.
    expect(p.step(4)).toEqual({ status: 'running', line: 3 })
    expect(p.step(1)).toEqual({ status: 'running', line: 4 })
    expect(p.step(1).status).toBe('done')
  })

  test('for는 반복마다, while은 조건을 계산할 때마다 1틱을 더 쓴다', () => {
    const count = (src: string) => {
      const p = new Program(parseSource(src), builtinsWith())
      let n = 0
      while (p.step(1).status === 'running') n++
      return n
    }
    const builtinsWith = () => new Map<string, Value>([['r', host('r', 1, 0, 0, () => ({ k: 'list', items: [1, 2, 3] }))]])
    // for 문 1 + r() 1 + (반복 1 + pass 1) * 3
    expect(count('for i in r():\n    pass')).toBe(8)
    // i = 0 1 + while 문 1 + (조건 1 + 본문 1) * 3 + 마지막 조건 1
    expect(count('i = 0\nwhile i < 3:\n    i += 1')).toBe(9)
  })

  test('stepStatement에서 생긴 빚은 step에서 갚는다', () => {
    const log: string[] = []
    const p = prog('while True:\n    act()', log)
    p.stepStatement()
    p.stepStatement()                // while 문과 첫 act() 문을 실행했다
    expect(log.length).toBe(1)
    p.step(1000)                     // 첫 동작의 빚 200틱을 갚고 남은 예산으로 동작을 이어 간다
    expect(log.length).toBe(5)
  })

  test('stepStatement를 거듭 불러도 빚은 사라지지 않고 쌓이며, takeDebt로 넘겨받을 수 있다', () => {
    const log: string[] = []
    const p = prog('act()\nact()\nact()', log)
    expect(p.debt).toBe(0)
    p.stepStatement()                // 첫 문장(1틱)과 동작(200틱), 다음 문장의 시작(1틱)
    expect(p.debt).toBe(202)
    p.stepStatement()
    expect(p.debt).toBe(403)
    expect(p.takeDebt()).toBe(403)
    expect(p.debt).toBe(0)
    expect(p.takeDebt()).toBe(0)
  })

  test('빚이 없으면 debt는 0이다', () => {
    const p = prog('x = 1\ny = 2\nz = 3', [])
    p.step(2)
    expect(p.debt).toBe(0)
    expect(p.takeDebt()).toBe(0)
  })

  test('stepStatement 뒤에 step으로 이어서 실행할 수 있다', () => {
    const lines: string[] = []
    const print = host('print', 1, 1, 1, a => { lines.push(String(a[0])); return null })
    const p = new Program(parseSource('print(1)\nprint(2)\nprint(3)\nprint(4)'), new Map([['print', print]]))
    expect(p.stepStatement()).toEqual({ status: 'running', line: 2 })
    expect(lines).toEqual(['1'])
    expect(p.step(100).status).toBe('done')
    expect(lines).toEqual(['1', '2', '3', '4'])
  })

  test('step으로 멈춘 뒤의 stepStatement는 실행 중이던 문장만 끝낸다', () => {
    const log: string[] = []
    const p = prog('act()\nact()\nact()', log)
    p.step(1)                        // 첫 문장을 시작하기 직전에 멈춘다
    expect(log.length).toBe(0)
    expect(p.stepStatement()).toEqual({ status: 'running', line: 2 })
    expect(log.length).toBe(1)
    p.step(250)                      // 첫 동작의 빚을 갚고 둘째 문장의 동작을 한 뒤, 새 빚 때문에 문장 가운데에서 멈춘다
    expect(log.length).toBe(2)
    expect(p.line).toBe(2)
    expect(p.stepStatement()).toEqual({ status: 'running', line: 3 })
    expect(log.length).toBe(2)
    expect(p.stepStatement().status).toBe('done')
    expect(log.length).toBe(3)
  })

  test('stepStatement는 함수 안으로 들어가 한 문장씩 멈춘다', () => {
    const p = new Program(parseSource('def f():\n    a = 1\n    return a\nx = f()\ny = x'), new Map())
    const seen: number[] = []
    for (let r = p.stepStatement(); r.status === 'running'; r = p.stepStatement()) seen.push(r.line)
    expect(seen).toEqual([4, 2, 3, 5])
  })

  test('외부 함수의 효과는 틱을 내기 전에 곧바로 나타난다', () => {
    const log: string[] = []
    const p = prog('act()', log)
    p.step(2)
    expect(log).toEqual(['act'])
    expect(p.step(100).status).toBe('running')
    expect(p.step(100).status).toBe('done')
  })
})
