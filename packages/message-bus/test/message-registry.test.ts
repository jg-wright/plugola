import { expect, test, vi } from 'vitest'
import { MessageRegistry } from '../src/Channel/MessageRegistry.ts'
import { CommandMessage } from '../src/Message/CommandMessage.ts'
import { MessageBus } from '../src/MessageBus.ts'

test('register() creates a routable message class and records it', () => {
  const registry = new MessageRegistry()
  const Clicked = registry.registerMessage<{ x: number }>('clicked')

  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()

  const spy = vi.fn()
  a.on(Clicked, spy)
  b.emit(new Clicked({ x: 1 }))

  expect(spy).toHaveBeenCalledTimes(1)
  expect(registry.classFor('clicked')).toBe(Clicked)
})

test('command() creates a CommandMessage class and records it', () => {
  const registry = new MessageRegistry()
  const ListFiles = registry.registerCommand<{ dir: string }, string>(
    'list-files',
  )

  expect(new ListFiles({ dir: '/tmp' })).toBeInstanceOf(CommandMessage)
  expect(registry.classFor('list-files')).toBe(ListFiles)
})

test('a registered message gets a default codec that round-trips the payload, dropping $-metadata', () => {
  const registry = new MessageRegistry()
  const Clicked = registry.registerMessage<{ x: number; y: number }>('clicked')

  const payload = Clicked.$encode(new Clicked({ x: 1, y: 2 }))
  expect(payload).toEqual({ x: 1, y: 2 })

  const decoded = Clicked.$decode(payload)
  expect(decoded).toBeInstanceOf(Clicked)
  expect(decoded).toEqual(new Clicked({ x: 1, y: 2 }))
})

test('a custom codec overrides encode and decode', () => {
  const registry = new MessageRegistry()
  const encode = vi.fn((m: { at: Date }) => ({ at: m.at.toISOString() }))
  const decode = vi.fn(
    (p: { at: string }) => new Occurred({ at: new Date(p.at) }),
  )
  const Occurred = registry.registerMessage<{ at: Date }>('occurred', {
    encode,
    decode,
  })

  const instance = new Occurred({ at: new Date('2020-01-01T00:00:00.000Z') })
  const payload = Occurred.$encode(instance)
  expect(payload).toEqual({ at: '2020-01-01T00:00:00.000Z' })
  expect(encode).toHaveBeenCalledWith(instance)

  const decoded = Occurred.$decode(payload)
  expect(decoded.at).toEqual(new Date('2020-01-01T00:00:00.000Z'))
  expect(decode).toHaveBeenCalledWith(payload)
})

test('a registered command round-trips through its default codec', () => {
  const registry = new MessageRegistry()
  const ListFiles = registry.registerCommand<{ dir: string }, string>(
    'list-files',
  )

  const listFiles = new ListFiles({ dir: '/tmp' })
  expect(ListFiles.$decode(ListFiles.$encode(listFiles))).toEqual(listFiles)
})

test('classFor() resolves a name to its class for decoding, or undefined', () => {
  const registry = new MessageRegistry()
  const Clicked = registry.registerMessage<{ x: number }>('clicked')

  const decoded = registry.classFor('clicked')!.$decode({ x: 1 })
  expect(decoded).toBeInstanceOf(Clicked)
  expect(decoded).toEqual(new Clicked({ x: 1 }))

  expect(registry.classFor('unknown')).toBeUndefined()
})

test('classes yields every registered class — the bridge forward set', () => {
  const registry = new MessageRegistry()
  const Clicked = registry.registerMessage<{ x: number }>('clicked')
  const ListFiles = registry.registerCommand<{ dir: string }, string>(
    'list-files',
  )

  expect([...registry.classes]).toEqual([Clicked, ListFiles])
})

test('a duplicate name throws, whether message or command', () => {
  const registry = new MessageRegistry()
  registry.registerMessage<{ x: number }>('clicked')

  expect(() => registry.registerMessage<{ y: number }>('clicked')).toThrow(
    /already registered/,
  )
  expect(() =>
    registry.registerCommand<{ dir: string }, string>('clicked'),
  ).toThrow(/already registered/)
})
