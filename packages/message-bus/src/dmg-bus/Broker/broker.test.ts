import { timeout } from '../lang/Signal.js'
import { beforeEach, describe, expect, Mock, test, vi } from 'vitest'
import { Bus } from '../Bus.js'
import { Event, Invocation } from '../Event.js'
import { CANCEL, type InvocationListenerContext } from '../EventListener.js'
import type { PluginBroker } from './PluginBroker.js'

let brokerA: PluginBroker
let brokerB: PluginBroker

beforeEach(() => {
  const bus = new Bus()
  brokerA = bus.broker('a')
  brokerB = bus.broker('b')
  bus.start()
})

test('emit', () => {
  const spy = vi.fn()
  const event = new TestEvent('bar')
  brokerA.on(TestEvent, spy)
  brokerB.emit(event)
  expect(spy).toHaveBeenCalledWith(event)
})

test('once', () => {
  const spy = vi.fn()
  const event = new TestEvent('bar')
  brokerA.once(TestEvent, spy)
  brokerA.emit(event)
  brokerB.emit(event)
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][0]).toBe(event)
})

test('twice', () => {
  const spy = vi.fn()
  const event = new TestEvent('bar')
  brokerA.on(TestEvent, spy)
  brokerA.emit(event)
  brokerB.emit(event)
  expect(spy).toHaveBeenCalledTimes(2)
})

test('until', async () => {
  const event = new TestEvent('bar')
  const promise = brokerA.until(TestEvent)
  brokerA.emit(event)
  expect(await promise).toEqual(event)
})

test('stop', () => {
  const spy = vi.fn()
  brokerB.stop('a')
  brokerA.on(TestEvent, spy)
  brokerB.emit(new TestEvent('foo'))
  expect(spy).not.toHaveBeenCalled()
  brokerB.start('a')
  expect(spy).toHaveBeenCalled()
})

test('abort', () => {
  const spy = vi.fn()
  brokerA.abortSignal.addEventListener('abort', spy)
  brokerB.abort('a')
  expect(spy).toHaveBeenCalled()
})

describe('invoke', () => {
  let spy: Mock<
    (
      event: TestInvocation,
      { send, finish }: InvocationListenerContext<typeof TestInvocation>,
    ) => void
  >

  beforeEach(() => {
    spy = vi.fn((event, { send, finish }) => {
      send(`one ${event.foo}`)
      send(`two ${event.foo}`)
      finish()
    })

    brokerA.register(TestInvocation, spy)
  })

  test('collect', () =>
    expect(
      brokerB.invoke(new TestInvocation('thing')).collect(),
    ).resolves.toEqual(['one thing', 'two thing']))

  test('iterate', async () => {
    let result: string[] = []
    for await (const item of brokerB
      .invoke(new TestInvocation('thing'))
      .iterate()) {
      result.push(item)
    }
    expect(result).toEqual(['one thing', 'two thing'])
  })

  test('it emits the event as well', () => {
    const onSpy = vi.fn()
    const event = new TestInvocation('bar')
    brokerA.on(TestInvocation, onSpy)
    brokerB.invoke(event)
    expect(onSpy).toHaveBeenCalledWith(event)
  })

  test('multi registers', async () => {
    brokerA.register(TestInvocation, (_, { finish, send }) => {
      send('foo')
      finish()
    })

    brokerB.register(TestInvocation, (_, { finish, send }) => {
      send('bar')
      finish()
    })

    expect(await brokerB.invoke(new TestInvocation('foo')).collect()).toEqual([
      'one foo',
      'two foo',
      'foo',
      'bar',
    ])
  })

  test('timeouts', async () => {
    brokerA.register(
      TestInvocation,
      async (event, { finish, send, signal }) => {
        send(`hello ${event.foo}`)
        await timeout(1_000, signal)
        send(`hello again ${event.foo}`)
        finish()
      },
    )

    expect(
      await brokerB
        .invoke(new TestInvocation('foo'), { signal: AbortSignal.timeout(10) })
        .collect(),
    ).toEqual(['one foo', 'two foo', 'hello foo'])
  })
})

describe('intercept', () => {
  test('cancelling', async () => {
    const spy = vi.fn()
    brokerA.on(TestEvent, spy)
    brokerB.intercept(TestEvent, () => CANCEL)
    await brokerB.emit(new TestEvent('foo'))
    expect(spy).not.toHaveBeenCalled()
  })

  test('changing the event', async () => {
    const spy = vi.fn()
    brokerA.on(TestEvent, spy)
    brokerB.intercept(
      TestEvent,
      (event) => new TestEvent(`Intercepted ${event.foo}`),
    )
    await brokerB.emit(new TestEvent('foo'))
    expect(spy).toHaveBeenCalledWith(new TestEvent('Intercepted foo'))
  })

  test('changing invocations', async () => {
    const spy = vi.fn()
    brokerA.register(TestInvocation, (event, { finish }) => {
      spy(event)
      finish()
    })
    brokerB.intercept(
      TestInvocation,
      (event) => new TestInvocation(`Intercepted ${event.foo}`),
    )
    await brokerB.invoke(new TestInvocation('foo')).collect()
    expect(spy).toHaveBeenCalledWith(new TestInvocation('Intercepted foo'))
  })
})

class TestEvent implements Event {
  $name = 'test'
  constructor(readonly foo: string) {}
}

class TestInvocation extends Invocation<string> {
  $name = 'test invocation'
  constructor(readonly foo: string) {
    super()
  }
}
