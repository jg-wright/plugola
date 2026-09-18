import { beforeEach, expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.js'
import { Message } from '../src/Message/Message.js'
import type { MessageGateway } from '../src/Gateway/MessageGateway.js'

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
  gatewayB.emit(new TestMessage('anything'))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a value filter matches on equality', () => {
  const spy = vi.fn()
  gatewayA.on(TestMessage, { foo: 'yes' }, spy)
  gatewayB.emit(new TestMessage('no'))
  expect(spy).not.toHaveBeenCalled()
  gatewayB.emit(new TestMessage('yes'))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a predicate filter matches on the returned boolean', () => {
  const spy = vi.fn()
  gatewayA.on(TestMessage, { foo: (m) => m.foo.startsWith('a') }, spy)
  gatewayB.emit(new TestMessage('bee'))
  expect(spy).not.toHaveBeenCalled()
  gatewayB.emit(new TestMessage('ant'))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a multi-key filter requires every key to match (AND, not OR)', () => {
  const spy = vi.fn()
  gatewayA.on(TestMessage, { foo: 'match', bar: 'match' }, spy)

  // only foo matches
  gatewayB.emit(new TestMessage('match', 'other'))
  // only bar matches
  gatewayB.emit(new TestMessage('other', 'match'))
  expect(spy).not.toHaveBeenCalled()

  // both match
  gatewayB.emit(new TestMessage('match', 'match'))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a multi-key filter mixes value and predicate keys with AND', () => {
  const spy = vi.fn()
  gatewayA.on(TestMessage, { foo: 'match', bar: (m) => m.bar.length > 2 }, spy)

  gatewayB.emit(new TestMessage('match', 'no')) // predicate fails
  gatewayB.emit(new TestMessage('nope', 'yesss')) // value fails
  expect(spy).not.toHaveBeenCalled()

  gatewayB.emit(new TestMessage('match', 'yesss'))
  expect(spy).toHaveBeenCalledTimes(1)
})

class TestMessage implements Message {
  $name = 'test'
  constructor(
    readonly foo: string,
    readonly bar: string = 'bar',
  ) {}
}
