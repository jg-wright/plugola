import set from 'lodash.set'
import { expect, test } from 'vitest'
import parseQueryParams from '@plugola/query-params/parse'

test('strings', () => {
  expect(parseQueryParams('?foo=bar&mung=face')).toEqual({
    foo: 'bar',
    mung: 'face',
  })
})

test('without leading ?', () => {
  expect(parseQueryParams('foo=bar&mung=face')).toEqual({
    foo: 'bar',
    mung: 'face',
  })
})

test('booleans', () => {
  expect(parseQueryParams('foo&!bar')).toEqual({
    foo: true,
    bar: false,
  })
})

test('arrays', () => {
  expect(parseQueryParams('foo[]=foo,bar')).toEqual({
    foo: ['foo', 'bar'],
  })
})

test('prepending arrays', () => {
  expect(parseQueryParams('foo[^]=bar,mung')).toEqual({
    foo: ['bar', 'mung'],
  })
  expect(
    parseQueryParams('foo[^]=bar,mung', { into: { foo: ['foo'] } }),
  ).toEqual({
    foo: ['bar', 'mung', 'foo'],
  })
})

test('appending arrays', () => {
  expect(parseQueryParams('foo[]=foo&foo[+]=bar,mung')).toEqual({
    foo: ['foo', 'bar', 'mung'],
  })
  expect(parseQueryParams('foo[+]=bar,mung')).toEqual({
    foo: ['bar', 'mung'],
  })
})

test('subtracting from arrays', () => {
  expect(parseQueryParams('foo[]=foo,bar&foo[-]=foo')).toEqual({
    foo: ['bar'],
  })
})

test('flags', () => {
  expect(parseQueryParams('foo{x}=mung,!face')).toEqual({
    foo: {
      mung: true,
      face: false,
    },
  })
})

test('json', () => {
  expect(parseQueryParams('foo{}={"bar": [1, 2]}')).toEqual({
    foo: {
      bar: [1, 2],
    },
  })
})

test('filter into', () => {
  expect(
    parseQueryParams('ignore[]=foo,bar&ac.foo=bar', {
      into: { version: 1 },
      set: (querParams, key, value) =>
        key.startsWith('ac.')
          ? { ...querParams, [key.slice(3)]: value }
          : querParams,
    }),
  ).toEqual({
    foo: 'bar',
    version: 1,
  })
})

test('custom merge function', () => {
  expect(parseQueryParams('foo.bar=fbar&foo.face=fface', { set })).toEqual({
    foo: {
      bar: 'fbar',
      face: 'fface',
    },
  })
})

test('values containing =', () => {
  expect(parseQueryParams('foo=a=b&bar{}={"x":"y=z"}')).toEqual({
    foo: 'a=b',
    bar: { x: 'y=z' },
  })
})

test('set receives how each value was derived', () => {
  const calls: unknown[] = []
  parseQueryParams('a=1&b&!c&d[]=x,y&e[^]=x&f[+]=x,y&g[-]=x&h{x}=x&i{}=1', {
    set: (queryParams, key, value, info) => {
      calls.push([key, info])
      return { ...queryParams, [key]: value }
    },
  })
  expect(calls).toEqual([
    ['a', { operation: 'set' }],
    ['b', { operation: 'true' }],
    ['c', { operation: 'false' }],
    ['d', { operation: 'array', items: ['x', 'y'] }],
    ['e', { operation: 'prepend', items: ['x'] }],
    ['f', { operation: 'append', items: ['x', 'y'] }],
    ['g', { operation: 'remove', items: ['x'] }],
    ['h', { operation: 'flags' }],
    ['i', { operation: 'json' }],
  ])
})

test('a malformed parameter is skipped without losing the others', () => {
  expect(parseQueryParams('foo=bar&bad{}={nope&mung=face')).toEqual({
    foo: 'bar',
    mung: 'face',
  })
})
