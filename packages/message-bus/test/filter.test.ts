import { beforeEach, expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'
import { message } from '../src/Message/Message.ts'

const TestMessage = message<{ foo: string; bar?: string }>('test')

let gatewayA: MessageGateway
let gatewayB: MessageGateway

beforeEach(() => {
  const bus = new MessageBus()
  gatewayA = bus.gateway('a')
  gatewayB = bus.gateway('b')
  bus.resume()
})

test('an empty filter matches every message', () => {
  const spy = vi.fn()
  gatewayA.on(TestMessage, {}, spy)
  gatewayB.emit(new TestMessage({ foo: 'anything' }))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a value filter matches on equality', () => {
  const spy = vi.fn()
  gatewayA.on(TestMessage, { foo: 'yes' }, spy)
  gatewayB.emit(new TestMessage({ foo: 'no' }))
  expect(spy).not.toHaveBeenCalled()
  gatewayB.emit(new TestMessage({ foo: 'yes' }))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a predicate filter matches on the returned boolean', () => {
  const spy = vi.fn()
  gatewayA.on(TestMessage, { foo: (m) => m.foo.startsWith('a') }, spy)
  gatewayB.emit(new TestMessage({ foo: 'bee' }))
  expect(spy).not.toHaveBeenCalled()
  gatewayB.emit(new TestMessage({ foo: 'ant' }))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a multi-key filter requires every key to match (AND, not OR)', () => {
  const spy = vi.fn()
  gatewayA.on(TestMessage, { foo: 'match', bar: 'match' }, spy)

  // only foo matches
  gatewayB.emit(new TestMessage({ foo: 'match', bar: 'other' }))
  // only bar matches
  gatewayB.emit(new TestMessage({ foo: 'other', bar: 'match' }))
  expect(spy).not.toHaveBeenCalled()

  // both match
  gatewayB.emit(new TestMessage({ foo: 'match', bar: 'match' }))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a multi-key filter mixes value and predicate keys with AND', () => {
  const spy = vi.fn()
  gatewayA.on(
    TestMessage,
    { foo: 'match', bar: (m) => (m.bar ?? '').length > 2 },
    spy,
  )

  gatewayB.emit(new TestMessage({ foo: 'match', bar: 'no' })) // predicate fails
  gatewayB.emit(new TestMessage({ foo: 'nope', bar: 'yesss' })) // value fails
  expect(spy).not.toHaveBeenCalled()

  gatewayB.emit(new TestMessage({ foo: 'match', bar: 'yesss' }))
  expect(spy).toHaveBeenCalledTimes(1)
})
