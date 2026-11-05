import { expect, test, vi } from 'vitest'
import { TransportableMessageRegistry } from '../src/MessageRegistry/TransportableMessageRegistry.ts'
import { MessageBus } from '../src/MessageBus.ts'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'

test('message() creates a routable message factory and records it', () => {
  const registry = TransportableMessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>()

  const { clicked } = registry.messages

  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()

  const spy = vi.fn()
  a.on(clicked, spy)
  b.emit(clicked({ x: 1 }))

  expect(spy).toHaveBeenCalledTimes(1)
  expect(registry.messageFactoryFor('clicked')).toBe(clicked)
})

test('command() creates a command factory and records it separately from messages', () => {
  const registry = TransportableMessageRegistry.create()
    .command('listFiles')
    .as<{ dir: string }, string>()

  const { listFiles } = registry.commands

  expect(listFiles({ dir: '/tmp' }).$factory).toBe(listFiles)
  expect(registry.commandFactoryFor('listFiles')).toBe(listFiles)
  expect([...registry.commandFactories]).toContain(listFiles)
  expect([...registry.messageFactories]).not.toContain(listFiles)
})

test('a registered message gets a default codec that round-trips the payload, dropping $-metadata', () => {
  const { clicked } = TransportableMessageRegistry.create()
    .message('clicked')
    .as<{ x: number; y: number }>().messages

  const payload = clicked.$encode(clicked({ x: 1, y: 2 }))
  expect(payload).toEqual({ x: 1, y: 2 })

  // toEqual proves the rebuilt message carries the right payload, $name, and
  // $factory (its routing identity).
  const decoded = clicked.$decode(payload)
  expect(decoded).toEqual(clicked({ x: 1, y: 2 }))
})

test('a custom codec overrides encode and decode', () => {
  const encode = vi.fn((m: { at: Date }) => ({ at: m.at.toISOString() }))
  const decode = vi.fn((p: { at: string }) => occurred({ at: new Date(p.at) }))
  const { occurred } = TransportableMessageRegistry.create()
    .message('occurred')
    .as<{ at: Date }>({ encode, decode }).messages

  const instance = occurred({ at: new Date('2020-01-01T00:00:00.000Z') })
  const payload = occurred.$encode(instance)
  expect(payload).toEqual({ at: '2020-01-01T00:00:00.000Z' })
  expect(encode).toHaveBeenCalledWith(instance)

  const decoded = occurred.$decode(payload)
  expect(decoded.at).toEqual(new Date('2020-01-01T00:00:00.000Z'))
  expect(decode).toHaveBeenCalledWith(payload)
})

test('a registered command round-trips through its default codec', () => {
  const { listFiles } = TransportableMessageRegistry.create()
    .command('listFiles')
    .as<{ dir: string }, string>().commands

  const command = listFiles({ dir: '/tmp' })
  expect(listFiles.$decode(listFiles.$encode(command))).toEqual(command)
})

test('messageFactoryFor() resolves a name to its factory for decoding, or undefined', () => {
  const registry = TransportableMessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>()

  const { clicked } = registry.messages

  const decoded = registry.messageFactoryFor('clicked').$decode({ x: 1 })
  expect(decoded).toHaveProperty('$factory', clicked)
  expect(decoded).toEqual(clicked({ x: 1 }))

  expect(
    // @ts-expect-error Argument of type '"unknown"' is not assignable to parameter of type '"clicked"'.
    registry.messageFactoryFor('unknown'),
  ).toBeUndefined()
})

test('messageFactories and commandFactories each yield their own kind — the bridge forward sets', () => {
  const registry = TransportableMessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>()

    .command('listFiles')
    .as<{ dir: string }, string>()

  const { clicked } = registry.messages
  const { listFiles } = registry.commands

  expect([...registry.messageFactories]).toEqual([clicked])
  expect([...registry.commandFactories]).toEqual([listFiles])
})

test('a duplicate name throws, whether message or command', () => {
  const registry = TransportableMessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>()

  expect(() => registry.message('clicked')).toThrow(/already registered/)
  expect(() => registry.command('clicked')).toThrow(/already registered/)
})

test('addMessage() adopts an existing factory under its $name and makes it transportable', () => {
  const Clicked = message<{ x: number }>('clicked')
  const registry = TransportableMessageRegistry.create().addMessage(Clicked)

  expect(lookup(registry, 'clicked')).toBe(Clicked)
  expect([...registry.messageFactories]).toEqual([Clicked])
  expect(lookup(registry, 'clicked').$decode({ x: 1 })).toEqual(
    Clicked({ x: 1 }),
  )
})

test('addCommand() adopts an existing command factory as a command', () => {
  const ListFiles = command<{ dir: string }, string>('listFiles')
  const registry = TransportableMessageRegistry.create().addCommand(ListFiles)

  expect([...registry.commandFactories]).toEqual([ListFiles])
  expect([...registry.messageFactories]).toEqual([])
})

test('an adopted factory keeps a codec it already has, unless given one', () => {
  const Clicked = message<{ x: number }>('clicked')
  const custom = vi.fn(() => ({}))
  TransportableMessageRegistry.create().addMessage(Clicked, { encode: custom })

  const keeps = TransportableMessageRegistry.create().addMessage(Clicked)
  expect(lookup(keeps, 'clicked').$encode).toBe(custom)

  const replacement = vi.fn(() => ({}))
  const replaces = TransportableMessageRegistry.create().addMessage(Clicked, {
    encode: replacement,
  })
  expect(lookup(replaces, 'clicked').$encode).toBe(replacement)
})

test('addMessage() and addCommand() throw on a name already registered', () => {
  const registry = TransportableMessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>()

  expect(() => registry.addMessage(message('clicked'))).toThrow(
    /already registered/,
  )
  expect(() => registry.addCommand(command('clicked'))).toThrow(
    /already registered/,
  )
})

/** Looks up a factory whose name `message<T>()` widened to `string`, so isn't in the registry's types. */
function lookup(
  registry: TransportableMessageRegistry<any, any>,
  name: string,
) {
  return registry.messageFactoryFor(name)
}
