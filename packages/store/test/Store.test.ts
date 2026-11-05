import { beforeEach, expect, test, vi } from 'vitest'
import { BaseActions, Store } from '../src/Store.js'

interface Actions extends BaseActions {
  foo: string
  bar: void
}

interface Context {
  foo: string
}

let store: Store<Actions, Context>

beforeEach(() => {
  store = new Store<Actions, Context>({
    __init__: () => ({ foo: '' }),
    foo: (context, foo) => ({ ...context, foo }),
    bar: (context) =>
      context.foo === 'bar' ? context : { ...context, foo: 'bar' },
  })
})

test('context management', () => {
  store.resume()
  expect(store.context).toEqual({ foo: '' })
  store.dispatch('bar')
  // @ts-expect-error
  store.dispatch('bar', 'error')
  expect(store.context).toEqual({ foo: 'bar' })
  store.dispatch('foo', 'mung')
  expect(store.context).toEqual({ foo: 'mung' })
})

test('subscribing to context changes', () => {
  const onUpdate = vi.fn()
  store.subscribe(onUpdate)
  store.dispatch('bar')
  store.resume()
  expect(onUpdate).toHaveBeenCalledWith({ foo: 'bar' }, 'bar')
})

test('stale subscribers', () => {
  const subscriber = vi.fn()
  store.subscribeToStaleEvents(subscriber)
  store.dispatch('bar')
  store.resume()
  expect(subscriber).not.toHaveBeenCalled()
  store.dispatch('bar')
  expect(subscriber).toHaveBeenCalledWith({ foo: 'bar' }, 'bar')
})

test('action listeners', () => {
  const subscriber = vi.fn()
  store.on('bar', subscriber)
  store.dispatch('bar')
  store.resume()
  expect(subscriber).toHaveBeenCalledTimes(1)
  expect(subscriber).toHaveBeenCalledWith({ foo: 'bar' })
})

test('unsubscribing from context changes', () => {
  const onUpdate = vi.fn()
  store.resume()
  const unsubscribe = store.subscribe(onUpdate)
  unsubscribe()
  store.dispatch('bar')
  expect(onUpdate).not.toHaveBeenCalled()
})

test('unsubscribing from stale events', () => {
  const subscriber = vi.fn()
  const unsubscribe = store.subscribeToStaleEvents(subscriber)
  store.resume()
  store.dispatch('bar')
  unsubscribe()
  store.dispatch('bar')
  expect(subscriber).not.toHaveBeenCalled()
})

test('unsubscribing from actions', () => {
  const subscriber = vi.fn()
  const unsubscribe = store.on('foo', subscriber)
  store.resume()
  store.dispatch('foo', 'one')
  unsubscribe()
  store.dispatch('foo', 'two')
  expect(subscriber).toHaveBeenCalledTimes(1)
})

test('unsubscribing twice only removes the one subscription', () => {
  const a = vi.fn()
  const b = vi.fn()
  store.resume()
  const unsubscribeA = store.subscribe(a)
  store.subscribe(b)
  unsubscribeA()
  unsubscribeA()
  store.dispatch('bar')
  expect(a).not.toHaveBeenCalled()
  expect(b).toHaveBeenCalledTimes(1)
})
