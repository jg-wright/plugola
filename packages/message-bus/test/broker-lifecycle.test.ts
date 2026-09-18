import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Bus } from '../src/Bus.js'
import { Event, Invocation } from '../src/Event.js'
import { CANCEL } from '../src/EventListener.js'
import type { PluginBroker } from '../src/Broker/PluginBroker.js'

let bus: Bus
let brokerA: PluginBroker
let brokerB: PluginBroker

beforeEach(() => {
  bus = new Bus()
  brokerA = bus.broker('a')
  brokerB = bus.broker('b')
  bus.resume()
})

describe('unsubscribe', () => {
  test('on() returns a disposer that stops delivery', () => {
    const spy = vi.fn()
    const off = brokerA.on(TestEvent, spy)
    brokerB.emit(new TestEvent('one'))
    off()
    brokerB.emit(new TestEvent('two'))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('a disposed listener does not resubscribe on a later emit', () => {
    const spy = vi.fn()
    const off = brokerA.on(TestEvent, spy)
    off()
    brokerB.emit(new TestEvent('x'))
    brokerB.emit(new TestEvent('y'))
    expect(spy).not.toHaveBeenCalled()
  })

  test('intercept() returns a disposer', async () => {
    const spy = vi.fn((e: TestEvent) => new TestEvent(`i ${e.foo}`))
    const off = brokerA.intercept(TestEvent, spy)
    off()
    const onSpy = vi.fn()
    brokerB.on(TestEvent, onSpy)
    await brokerB.emit(new TestEvent('foo'))
    expect(spy).not.toHaveBeenCalled()
    expect(onSpy).toHaveBeenCalledWith(new TestEvent('foo'))
  })
})

describe('abort', () => {
  test('clears the aborted broker’s event handlers', () => {
    const spy = vi.fn()
    brokerA.on(TestEvent, spy)
    brokerB.abort('a')
    brokerB.emit(new TestEvent('foo'))
    expect(spy).not.toHaveBeenCalled()
  })

  test('removes the broker from the bus so its name can be reused', () => {
    brokerA.abort('a')
    expect(() => bus.broker('a')).not.toThrow()
  })

  test('onAbort fires once with the reason', () => {
    const spy = vi.fn()
    brokerA.onAbort(spy)
    const reason = new Error('bye')
    brokerB.abort('a', reason)
    expect(brokerA.abortSignal.aborted).toBe(true)
    expect(brokerA.abortSignal.reason).toBe(reason)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('registering the same broker name twice', () => {
  test('throws', () => {
    expect(() => bus.broker('a')).toThrow(/already been registered/)
  })
})

describe('pause / resume', () => {
  test('events emitted while a broker is paused are buffered then replayed', () => {
    const spy = vi.fn()
    brokerB.pause('a')
    brokerA.on(TestEvent, spy)
    brokerB.emit(new TestEvent('foo'))
    expect(spy).not.toHaveBeenCalled()
    brokerB.resume('a')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('a paused broker does not intercept', async () => {
    const spy = vi.fn((e: TestEvent) => new TestEvent(`i ${e.foo}`))
    brokerA.intercept(TestEvent, spy)
    brokerB.pause('a')
    const onSpy = vi.fn()
    brokerB.on(TestEvent, onSpy)
    await brokerB.emit(new TestEvent('foo'))
    expect(spy).not.toHaveBeenCalled()
    expect(onSpy).toHaveBeenCalledWith(new TestEvent('foo'))
  })
})

describe('invoke completion', () => {
  test('collect resolves to [] when there are no registrants', async () => {
    expect(await brokerB.invoke(new TestInvocation('x')).collect()).toEqual([])
  })

  test('collect resolves to [] when the only registrant is paused', async () => {
    brokerA.register(TestInvocation, (_e, { send }) => {
      send('nope')
    })
    brokerB.pause('a')
    expect(await brokerB.invoke(new TestInvocation('x')).collect()).toEqual([])
  })

  test('a filtered-out handler does not hang the stream', async () => {
    // Regression: completion is per-handler settling, so a handler whose filter
    // rejects the event completes immediately instead of deadlocking collect().
    brokerA.register(TestInvocation, { foo: 'never' }, (_e, { send }) => {
      send('nope')
    })
    expect(
      await brokerB.invoke(new TestInvocation('actual')).collect(),
    ).toEqual([])
  })

  test('completes when a handler returns without any explicit signal', async () => {
    brokerA.register(TestInvocation, (_e, { send }) => {
      send('a')
      send('b')
    })
    expect(await brokerB.invoke(new TestInvocation('x')).collect()).toEqual([
      'a',
      'b',
    ])
  })

  test('waits for an async handler to settle before completing', async () => {
    brokerA.register(TestInvocation, async (_e, { send }) => {
      send('first')
      await Promise.resolve()
      await Promise.resolve()
      send('second')
    })
    expect(await brokerB.invoke(new TestInvocation('x')).collect()).toEqual([
      'first',
      'second',
    ])
  })

  test('a throwing handler rejects the stream when no onError is given', async () => {
    brokerA.register(TestInvocation, () => {
      throw new Error('boom')
    })
    await expect(
      brokerB.invoke(new TestInvocation('x')).collect(),
    ).rejects.toThrow('boom')
  })

  test('onError isolates a throwing handler and the stream still completes', async () => {
    brokerA.register(TestInvocation, () => {
      throw new Error('boom')
    })
    brokerB.register(TestInvocation, (_e, { send }) => send('ok'))

    const onError = vi.fn()
    const items = await brokerB
      .invoke(new TestInvocation('x'), { onError })
      .collect()

    expect(items).toEqual(['ok'])
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect((onError.mock.calls[0][0] as Error).message).toBe('boom')
  })

  test('onError also catches a rejected async handler', async () => {
    brokerA.register(TestInvocation, async () => {
      throw new Error('async boom')
    })

    const onError = vi.fn()
    const items = await brokerA
      .invoke(new TestInvocation('x'), { onError })
      .collect()

    expect(items).toEqual([])
    expect((onError.mock.calls[0][0] as Error).message).toBe('async boom')
  })

  test('onError receives an error from every failing handler across brokers', async () => {
    brokerA.register(TestInvocation, () => {
      throw new Error('a')
    })
    brokerB.register(TestInvocation, () => {
      throw new Error('b')
    })

    const onError = vi.fn()
    await brokerA.invoke(new TestInvocation('x'), { onError }).collect()

    const messages = onError.mock.calls.map((c) => (c[0] as Error).message)
    expect(messages.sort()).toEqual(['a', 'b'])
  })

  test('completes across multiple brokers each streaming', async () => {
    brokerA.register(TestInvocation, (_e, { send }) => send('a'))
    brokerB.register(TestInvocation, async (_e, { send }) => {
      await Promise.resolve()
      send('b')
    })
    const items = await brokerA.invoke(new TestInvocation('x')).collect()
    expect(items.sort()).toEqual(['a', 'b'])
  })
})

describe('multiple interceptors', () => {
  test('are applied in a chain', async () => {
    brokerA.intercept(TestEvent, (e) => new TestEvent(`${e.foo}-a`))
    brokerB.intercept(TestEvent, (e) => new TestEvent(`${e.foo}-b`))
    const spy = vi.fn()
    brokerA.on(TestEvent, spy)
    await brokerB.emit(new TestEvent('start'))
    const received = spy.mock.calls[0]?.[0] as TestEvent
    expect(received.foo).toMatch(/^start-/)
  })

  test('a later interceptor can cancel after an earlier one transformed', async () => {
    brokerA.intercept(TestEvent, (e) => new TestEvent(`${e.foo}-a`))
    brokerB.intercept(TestEvent, () => CANCEL)
    const spy = vi.fn()
    brokerA.on(TestEvent, spy)
    const result = await brokerB.emit(new TestEvent('start'))
    expect(result).toBe(CANCEL)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('emit return value', () => {
  test('each call resolves to its own (possibly intercepted) event', async () => {
    brokerA.intercept(TestEvent, (e) => new TestEvent(`i ${e.foo}`))
    const first = (await brokerB.emit(new TestEvent('one'))) as TestEvent
    const second = (await brokerB.emit(new TestEvent('two'))) as TestEvent
    expect(first.foo).toBe('i one')
    expect(second.foo).toBe('i two')
  })

  test('a cancelled emit resolves to CANCEL without leaking to later emits', async () => {
    brokerA.intercept(TestEvent, { foo: 'kill' }, () => CANCEL)
    expect(await brokerB.emit(new TestEvent('kill'))).toBe(CANCEL)
    const after = (await brokerB.emit(new TestEvent('ok'))) as TestEvent
    expect(after.foo).toBe('ok')
  })
})

describe('until', () => {
  test('rejects when the broker aborts before the event arrives', async () => {
    const promise = brokerA.until(TestEvent)
    const reason = new Error('gone')
    brokerB.abort('a', reason)
    await expect(promise).rejects.toBe(reason)
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
