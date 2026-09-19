import { expect, test, vi } from 'vitest'
import { message } from '../src/Message/Message.ts'
import { command, CommandMessage } from '../src/Message/CommandMessage.ts'
import { MessageBus } from '../src/MessageBus.ts'

test('a message carries its name as a static and on the instance', () => {
  const Clicked = message<{ x: number; y: number }>('clicked')

  expect(Clicked.$name).toBe('clicked')
  expect(new Clicked({ x: 1, y: 2 }).$name).toBe('clicked')
})

test('the payload is spread onto the instance', () => {
  const Clicked = message<{ x: number; y: number }>('clicked')

  const clicked = new Clicked({ x: 1, y: 2 })
  expect(clicked.x).toBe(1)
  expect(clicked.y).toBe(2)
})

test('the default codec round-trips through the payload fields, dropping $-metadata', () => {
  const Clicked = message<{ x: number; y: number }>('clicked')

  const payload = Clicked.$encode(new Clicked({ x: 1, y: 2 }))
  expect(payload).toEqual({ x: 1, y: 2 })

  const decoded = Clicked.$decode(payload)
  expect(decoded).toBeInstanceOf(Clicked)
  expect(decoded).toEqual(new Clicked({ x: 1, y: 2 }))
})

test('a custom codec overrides encode and decode', () => {
  const encode = vi.fn((m: { at: Date }) => ({ at: m.at.toISOString() }))
  const decode = vi.fn(
    (p: { at: string }) => new Occurred({ at: new Date(p.at) }),
  )
  const Occurred = message<{ at: Date }>('occurred', { encode, decode })

  const instance = new Occurred({ at: new Date('2020-01-01T00:00:00.000Z') })
  const payload = Occurred.$encode(instance)
  expect(payload).toEqual({ at: '2020-01-01T00:00:00.000Z' })
  expect(encode).toHaveBeenCalledWith(instance)

  const decoded = Occurred.$decode(payload)
  expect(decoded.at).toEqual(new Date('2020-01-01T00:00:00.000Z'))
  expect(decode).toHaveBeenCalledWith(payload)
})

test('a command is a CommandMessage subclass with the same metadata', () => {
  const ListFiles = command<{ dir: string }, string>('list-files')

  const listFiles = new ListFiles({ dir: '/tmp' })
  expect(listFiles).toBeInstanceOf(CommandMessage)
  expect(ListFiles.$name).toBe('list-files')
  expect(listFiles.$name).toBe('list-files')
  expect(listFiles.dir).toBe('/tmp')
  expect(ListFiles.$decode(ListFiles.$encode(listFiles))).toEqual(listFiles)
})

test('a generated message is routable on the bus by its class identity', () => {
  const Clicked = message<{ x: number }>('clicked')
  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()

  const spy = vi.fn()
  a.on(Clicked, spy)
  b.emit(new Clicked({ x: 1 }))

  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][0]).toBeInstanceOf(Clicked)
  expect(spy.mock.calls[0][0].x).toBe(1)
})
