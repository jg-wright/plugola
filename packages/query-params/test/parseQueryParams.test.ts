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
      amendKey: (key) => key.slice(3),
      into: { version: 1 },
      filter: (key) => key.startsWith('ac.'),
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
