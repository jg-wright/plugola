import { expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { message } from '../src/Message/Message.ts'
import { CANCEL } from '../src/Roles/Interceptor.ts'

const Ping = message<{ n: number }>('ping')

test('synchronous interceptors keep delivery synchronous', () => {
  const { a, b } = setup()
  const spy = vi.fn()
  a.on(Ping, spy)
  a.intercept(Ping, (message) => Ping({ n: message.n + 1 }))
  b.intercept(Ping, () => undefined)

  b.emit(Ping({ n: 1 }))

  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ n: 2 }))
})

test('a synchronous cancel stops delivery', () => {
  const { a, b } = setup()
  const spy = vi.fn()
  a.on(Ping, spy)
  a.intercept(Ping, () => CANCEL)

  b.emit(Ping({ n: 1 }))

  expect(spy).not.toHaveBeenCalled()
})

test('an asynchronous interceptor defers delivery until it settles', async () => {
  const { a, b } = setup()
  const spy = vi.fn()
  a.on(Ping, spy)
  a.intercept(Ping, async (message) => Ping({ n: message.n * 10 }))
  b.intercept(Ping, (message) => Ping({ n: message.n + 1 }))

  const emitted = b.emit(Ping({ n: 1 }))
  expect(spy).not.toHaveBeenCalled()

  expect(await emitted).toEqual(expect.objectContaining({ n: 11 }))
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ n: 11 }))
})

function setup() {
  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()
  return { a, b }
}
