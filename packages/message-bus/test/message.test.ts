import { expect, test, vi } from 'vitest'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'
import { MessageBus } from '../src/MessageBus.ts'

// Transportability (`$encode`/`$decode`) is added by a Channel's MessageRegistry,
// not by these factories — those tests live in message-registry.test.ts.

test('a message carries its name on the factory and on each message', () => {
  const Clicked = message<{ x: number; y: number }>('clicked')

  expect(Clicked.$name).toBe('clicked')
  expect(Clicked({ x: 1, y: 2 }).$name).toBe('clicked')
})

test('the payload is spread onto the message', () => {
  const Clicked = message<{ x: number; y: number }>('clicked')

  const clicked = Clicked({ x: 1, y: 2 })
  expect(clicked.x).toBe(1)
  expect(clicked.y).toBe(2)
})

test('a command factory builds messages that point back at it, with the same metadata', () => {
  const ListFiles = command<{ dir: string }, string>('list-files')

  const listFiles = ListFiles({ dir: '/tmp' })
  expect(listFiles.$factory).toBe(ListFiles)
  expect(ListFiles.$name).toBe('list-files')
  expect(listFiles.$name).toBe('list-files')
  expect(listFiles.dir).toBe('/tmp')
})

test('a generated message is routable on the bus by its factory identity', () => {
  const Clicked = message<{ x: number }>('clicked')
  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()

  const spy = vi.fn()
  a.on(Clicked, spy)
  b.emit(Clicked({ x: 1 }))

  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][0].$factory).toBe(Clicked)
  expect(spy.mock.calls[0][0].x).toBe(1)
})
