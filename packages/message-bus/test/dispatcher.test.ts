import { expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { message } from '../src/Message/Message.ts'
import type { Dispatcher } from '../src/Roles/Dispatcher.ts'

const Ping = message<{ n: number }>('ping')

test('subscribers are delivered to immediately by default', () => {
  const { a, b } = setup()
  const spy = vi.fn()
  a.on(Ping, spy)
  b.emit(Ping({ n: 1 }))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a custom dispatcher schedules each delivery', () => {
  const { dispatcher, flush } = deferredDispatcher()
  const { a, b } = setup({ dispatcher })
  const one = vi.fn()
  const two = vi.fn()
  a.on(Ping, one)
  a.on(Ping, two)

  b.emit(Ping({ n: 1 }))
  expect(one).not.toHaveBeenCalled()
  expect(two).not.toHaveBeenCalled()

  flush()
  expect(one).toHaveBeenCalledWith(expect.objectContaining({ n: 1 }))
  expect(two).toHaveBeenCalledWith(expect.objectContaining({ n: 1 }))
})

test('the dispatcher can be swapped at runtime', () => {
  const { bus, a, b } = setup()
  const { dispatcher, flush } = deferredDispatcher()
  const spy = vi.fn()
  a.on(Ping, spy)

  bus.dispatcher = dispatcher
  b.emit(Ping({ n: 1 }))
  expect(spy).not.toHaveBeenCalled()
  flush()
  expect(spy).toHaveBeenCalledTimes(1)
})

test('sync subscribers bypass the dispatcher', () => {
  const { dispatcher } = deferredDispatcher()
  const { a, b } = setup({ dispatcher })
  const sync = vi.fn()
  const filtered = vi.fn()
  const scheduled = vi.fn()
  a.on(Ping, sync, { sync: true })
  a.on(Ping, { n: 1 }, filtered, { sync: true })
  a.on(Ping, scheduled)

  b.emit(Ping({ n: 1 }))
  expect(sync).toHaveBeenCalledTimes(1)
  expect(filtered).toHaveBeenCalledTimes(1)
  expect(scheduled).not.toHaveBeenCalled()
})

test('once fires once even when deliveries were queued by the dispatcher', () => {
  const { dispatcher, flush } = deferredDispatcher()
  const { a, b } = setup({ dispatcher })
  const spy = vi.fn()
  a.once(Ping, spy)

  b.emit(Ping({ n: 1 }))
  b.emit(Ping({ n: 2 }))
  flush()
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ n: 1 }))
})

function setup(options?: { dispatcher?: Dispatcher }) {
  const bus = new MessageBus(options)
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()
  return { bus, a, b }
}

function deferredDispatcher() {
  const queue: (() => void)[] = []
  const dispatcher: Dispatcher = (deliver) => {
    queue.push(deliver)
  }
  const flush = () => {
    for (let deliver; (deliver = queue.shift()); ) deliver()
  }
  return { dispatcher, flush }
}
