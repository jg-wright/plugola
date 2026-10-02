import { expect, test, vi } from 'vitest'
import { MessageRegistry } from '../src/MessageRegistry/MessageRegistry.ts'
import { MessageBus } from '../src/MessageBus.ts'

test('registerMessage() creates a routable message factory and records it', () => {
  const { clicked } = MessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>().messages

  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()

  const spy = vi.fn()
  a.on(clicked, spy)
  b.emit(clicked({ x: 1 }))

  expect(spy).toHaveBeenCalledTimes(1)
})

test('a message registered with no payload type is built with no argument', () => {
  const { opened } = MessageRegistry.create().message('opened').as().messages

  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  bus.resume()

  const spy = vi.fn()
  a.on(opened, spy)
  b.emit(opened())

  expect(spy).toHaveBeenCalledTimes(1)
  expect(opened().$factory).toBe(opened)
})

test('a command registered with no payload type is built with no argument', () => {
  const registry = MessageRegistry.create().command('ping').as<{}, 'pong'>()

  const { ping } = registry.commands

  expect(ping().$factory).toBe(ping)
  expect(registry.commandFactoryFor('ping')).toBe(ping)
})

test('registerCommand() records a command separately from messages', () => {
  const registry = MessageRegistry.create()
    .command('listFiles')
    .as<{ dir: string }, string>()

  const { listFiles } = registry.commands

  expect(listFiles({ dir: '/tmp' }).$factory).toBe(listFiles)
  expect(registry.commandFactoryFor('listFiles')).toBe(listFiles)
  expect([...registry.commandFactories]).toContain(listFiles)
  expect([...registry.messageFactories]).not.toContain(listFiles)
})

test('a registered factory is plain — no transport codec is layered on', () => {
  const { clicked } = MessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>().messages

  // The base registry adds name-collision safety and lookup only; it does not
  // require (or add) Transportability, so there is no `$encode`/`$decode`.
  expect('$encode' in clicked).toBe(false)
  expect('$decode' in clicked).toBe(false)
})

test('factoryFor() resolves a name to its factory, or undefined', () => {
  const registry = MessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>()

  const { clicked } = registry.messages

  expect(registry.messageFactoryFor('clicked')).toBe(clicked)
  expect(
    // @ts-expect-error Argument of type '"unknown"' is not assignable to parameter of type '"clicked"'.
    registry.messageFactoryFor('unknown'),
  ).toBeUndefined()
})

test('messageFactories and commandFactories each yield their own kind', () => {
  const registry = MessageRegistry.create()

    .message('clicked')
    .as<{ x: number }>()

    .command('listFiles')
    .as<{ dir: string }, string>()

  const { clicked } = registry.messages
  const { listFiles } = registry.commands

  expect([...registry.messageFactories]).toEqual([clicked])
  expect([...registry.commandFactories]).toEqual([listFiles])
})

test('combine() merges the factories of several registries into one', () => {
  const clicks = MessageRegistry.create().message('clicked').as<{ x: number }>()

  const files = MessageRegistry.create()
    .command('listFiles')
    .as<{ dir: string }, string>()

  const combined = MessageRegistry.combine(clicks, files)

  const { clicked } = clicks.messages
  const { listFiles } = files.commands

  expect(combined.messageFactoryFor('clicked')).toBe(clicked)
  expect(combined.commandFactoryFor('listFiles')).toBe(listFiles)
  expect([...combined.messageFactories]).toEqual([clicked])
  expect([...combined.commandFactories]).toEqual([listFiles])
})

test('combine() throws on a name used by more than one registry', () => {
  const a = MessageRegistry.create().message('clicked').as<{ x: number }>()
  const b = MessageRegistry.create().message('clicked').as<{ y: number }>()

  expect(() => MessageRegistry.combine(a, b)).toThrow(/already registered/)
})

test('a duplicate name throws, whether message or command', () => {
  const registry = MessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>()

  expect(() => registry.message('clicked')).toThrow(/already registered/)
  expect(() => registry.command('clicked')).toThrow(/already registered/)
})
