import { expect, test, vi } from 'vitest'
import { MessageRegistry } from '../src/Channel/MessageRegistry.ts'
import { MessageBus } from '../src/MessageBus.ts'

test('register() creates a routable message factory and records it', () => {
  const registry = new MessageRegistry()
  const Clicked = registry.registerMessage<{ x: number }>('clicked')

  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()

  const spy = vi.fn()
  a.on(Clicked, spy)
  b.emit(Clicked({ x: 1 }))

  expect(spy).toHaveBeenCalledTimes(1)
  expect(registry.factoryFor('clicked')).toBe(Clicked)
})

test('command() creates a command factory and records it separately from messages', () => {
  const registry = new MessageRegistry()
  const ListFiles = registry.registerCommand<{ dir: string }, string>(
    'list-files',
  )

  expect(ListFiles({ dir: '/tmp' }).$factory).toBe(ListFiles)
  expect(registry.factoryFor('list-files')).toBe(ListFiles)
  expect([...registry.commandFactories]).toContain(ListFiles)
  expect([...registry.messageFactories]).not.toContain(ListFiles)
})

test('a registered message gets a default codec that round-trips the payload, dropping $-metadata', () => {
  const registry = new MessageRegistry()
  const Clicked = registry.registerMessage<{ x: number; y: number }>('clicked')

  const payload = Clicked.$encode(Clicked({ x: 1, y: 2 }))
  expect(payload).toEqual({ x: 1, y: 2 })

  // toEqual proves the rebuilt message carries the right payload, $name, and
  // $factory (its routing identity).
  const decoded = Clicked.$decode(payload)
  expect(decoded).toEqual(Clicked({ x: 1, y: 2 }))
})

test('a custom codec overrides encode and decode', () => {
  const registry = new MessageRegistry()
  const encode = vi.fn((m: { at: Date }) => ({ at: m.at.toISOString() }))
  const decode = vi.fn((p: { at: string }) => Occurred({ at: new Date(p.at) }))
  const Occurred = registry.registerMessage<{ at: Date }>('occurred', {
    encode,
    decode,
  })

  const instance = Occurred({ at: new Date('2020-01-01T00:00:00.000Z') })
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

  const listFiles = ListFiles({ dir: '/tmp' })
  expect(ListFiles.$decode(ListFiles.$encode(listFiles))).toEqual(listFiles)
})

test('factoryFor() resolves a name to its factory for decoding, or undefined', () => {
  const registry = new MessageRegistry()
  const Clicked = registry.registerMessage<{ x: number }>('clicked')

  const decoded = registry.factoryFor('clicked')!.$decode({ x: 1 })
  expect(decoded.$factory).toBe(Clicked)
  expect(decoded).toEqual(Clicked({ x: 1 }))

  expect(registry.factoryFor('unknown')).toBeUndefined()
})

test('messageFactories and commandFactories each yield their own kind — the bridge forward sets', () => {
  const registry = new MessageRegistry()
  const Clicked = registry.registerMessage<{ x: number }>('clicked')
  const ListFiles = registry.registerCommand<{ dir: string }, string>(
    'list-files',
  )

  expect([...registry.messageFactories]).toEqual([Clicked])
  expect([...registry.commandFactories]).toEqual([ListFiles])
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
