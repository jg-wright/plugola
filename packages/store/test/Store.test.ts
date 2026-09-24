import { beforeEach, expect, test, vi } from 'vitest'
import { BaseActions, Store } from '../src/Store.js'

interface Actions extends BaseActions {
  foo: string
  bar: null
}

interface Context {
  foo: string
}

let store: Store<Actions, Context>

beforeEach(() => {
  store = new Store<Actions, Context>({
    __init__: () => ({ foo: '' }),
    foo: (foo, context) => ({ ...context, foo }),
    bar: (_, context) =>
      context.foo === 'bar' ? context : { ...context, foo: 'bar' },
  })
})

test('context management', () => {
  expect(store.context).toEqual({ foo: '' })
  store.dispatch('bar', null)
  // @ts-expect-error
  store.dispatch('bar', 'error')
  expect(store.context).toEqual({ foo: 'bar' })
  store.dispatch('foo', 'mung')
  expect(store.context).toEqual({ foo: 'mung' })
})

test('subscribing to context changes', () => {
  const onUpdate = vi.fn()
  store.subscribe(onUpdate)
  store.dispatch('bar', null)
  expect(onUpdate).toHaveBeenCalledWith('bar', null, { foo: 'bar' })
})

test('stale subscribers', () => {
  const subscriber = vi.fn()
  store.subscribeToStaleEvents(subscriber)
  store.dispatch('bar', null)
  expect(subscriber).not.toHaveBeenCalled()
  store.dispatch('bar', null)
  expect(subscriber).toHaveBeenCalledWith('bar', null, { foo: 'bar' })
})

test('action listeners', () => {
  const subscriber = vi.fn()
  store.on('bar', subscriber)
  store.dispatch('bar', null)
  store.dispatch('bar', null)
  expect(subscriber).toHaveBeenCalledTimes(1)
  expect(subscriber).toHaveBeenCalledWith(null, { foo: 'bar' })
})
