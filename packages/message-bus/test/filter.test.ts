import { beforeEach, expect, test, vi } from 'vitest'
import { Bus } from '../src/Bus.js'
import { Event } from '../src/Event.js'
import type { PluginBroker } from '../src/Broker/PluginBroker.js'

let brokerA: PluginBroker
let brokerB: PluginBroker

beforeEach(() => {
  const bus = new Bus()
  brokerA = bus.broker('a')
  brokerB = bus.broker('b')
  bus.resume()
})

test('an empty filter matches every event', () => {
  const spy = vi.fn()
  brokerA.on(TestEvent, {}, spy)
  brokerB.emit(new TestEvent('anything'))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a value filter matches on equality', () => {
  const spy = vi.fn()
  brokerA.on(TestEvent, { foo: 'yes' }, spy)
  brokerB.emit(new TestEvent('no'))
  expect(spy).not.toHaveBeenCalled()
  brokerB.emit(new TestEvent('yes'))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a predicate filter matches on the returned boolean', () => {
  const spy = vi.fn()
  brokerA.on(TestEvent, { foo: (e) => e.foo.startsWith('a') }, spy)
  brokerB.emit(new TestEvent('bee'))
  expect(spy).not.toHaveBeenCalled()
  brokerB.emit(new TestEvent('ant'))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a multi-key filter requires every key to match (AND, not OR)', () => {
  const spy = vi.fn()
  brokerA.on(TestEvent, { foo: 'match', bar: 'match' }, spy)

  // only foo matches
  brokerB.emit(new TestEvent('match', 'other'))
  // only bar matches
  brokerB.emit(new TestEvent('other', 'match'))
  expect(spy).not.toHaveBeenCalled()

  // both match
  brokerB.emit(new TestEvent('match', 'match'))
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a multi-key filter mixes value and predicate keys with AND', () => {
  const spy = vi.fn()
  brokerA.on(TestEvent, { foo: 'match', bar: (e) => e.bar.length > 2 }, spy)

  brokerB.emit(new TestEvent('match', 'no')) // predicate fails
  brokerB.emit(new TestEvent('nope', 'yesss')) // value fails
  expect(spy).not.toHaveBeenCalled()

  brokerB.emit(new TestEvent('match', 'yesss'))
  expect(spy).toHaveBeenCalledTimes(1)
})

class TestEvent implements Event {
  $name = 'test'
  constructor(
    readonly foo: string,
    readonly bar: string = 'bar',
  ) {}
}
