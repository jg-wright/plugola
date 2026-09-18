import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.js'
import { Message } from '../src/Message/Message.js'
import { CommandMessage } from '../src/Message/CommandMessage.js'
import { CANCEL } from '../src/Roles/Interceptor.js'
import type { MessageGateway } from '../src/Participant/MessageGateway.js'

let bus: MessageBus
let gatewayA: MessageGateway
let gatewayB: MessageGateway

beforeEach(() => {
  bus = new MessageBus()
  gatewayA = bus.gateway('a')
  gatewayB = bus.gateway('b')
  bus.resume()
})

describe('unsubscribe', () => {
  test('on() returns a disposer that stops delivery', () => {
    const spy = vi.fn()
    const off = gatewayA.on(TestMessage, spy)
    gatewayB.emit(new TestMessage('one'))
    off()
    gatewayB.emit(new TestMessage('two'))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('a disposed subscriber does not resubscribe on a later emit', () => {
    const spy = vi.fn()
    const off = gatewayA.on(TestMessage, spy)
    off()
    gatewayB.emit(new TestMessage('x'))
    gatewayB.emit(new TestMessage('y'))
    expect(spy).not.toHaveBeenCalled()
  })

  test('intercept() returns a disposer', async () => {
    const spy = vi.fn((m: TestMessage) => new TestMessage(`i ${m.foo}`))
    const off = gatewayA.intercept(TestMessage, spy)
    off()
    const onSpy = vi.fn()
    gatewayB.on(TestMessage, onSpy)
    await gatewayB.emit(new TestMessage('foo'))
    expect(spy).not.toHaveBeenCalled()
    expect(onSpy).toHaveBeenCalledWith(new TestMessage('foo'))
  })
})

describe('abort', () => {
  test('clears the aborted gateway’s subscribers', () => {
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    gatewayB.abort('a')
    gatewayB.emit(new TestMessage('foo'))
    expect(spy).not.toHaveBeenCalled()
  })

  test('removes the gateway from the bus so its name can be reused', () => {
    gatewayA.abort('a')
    expect(() => bus.gateway('a')).not.toThrow()
  })

  test('onAbort fires once with the reason', () => {
    const spy = vi.fn()
    gatewayA.onAbort(spy)
    const reason = new Error('bye')
    gatewayB.abort('a', reason)
    expect(gatewayA.abortSignal.aborted).toBe(true)
    expect(gatewayA.abortSignal.reason).toBe(reason)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('registering the same gateway name twice', () => {
  test('throws', () => {
    expect(() => bus.gateway('a')).toThrow(/already been registered/)
  })
})

describe('pause / resume', () => {
  test('messages emitted while a gateway is paused are buffered then replayed', () => {
    const spy = vi.fn()
    gatewayB.pause('a')
    gatewayA.on(TestMessage, spy)
    gatewayB.emit(new TestMessage('foo'))
    expect(spy).not.toHaveBeenCalled()
    gatewayB.resume('a')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('a paused gateway does not intercept', async () => {
    const spy = vi.fn((m: TestMessage) => new TestMessage(`i ${m.foo}`))
    gatewayA.intercept(TestMessage, spy)
    gatewayB.pause('a')
    const onSpy = vi.fn()
    gatewayB.on(TestMessage, onSpy)
    await gatewayB.emit(new TestMessage('foo'))
    expect(spy).not.toHaveBeenCalled()
    expect(onSpy).toHaveBeenCalledWith(new TestMessage('foo'))
  })
})

describe('invoke completion', () => {
  test('collect resolves to [] when there are no registrants', async () => {
    expect(await gatewayB.invoke(new TestCommand('x')).collect()).toEqual([])
  })

  test('collect resolves to [] when the only registrant is paused', async () => {
    gatewayA.register(TestCommand, (_e, { send }) => {
      send('nope')
    })
    gatewayB.pause('a')
    expect(await gatewayB.invoke(new TestCommand('x')).collect()).toEqual([])
  })

  test('a filtered-out responder does not hang the stream', async () => {
    // Regression: completion is per-responder settling, so a responder whose
    // filter rejects the command completes immediately instead of deadlocking
    // collect().
    gatewayA.register(TestCommand, { foo: 'never' }, (_e, { send }) => {
      send('nope')
    })
    expect(await gatewayB.invoke(new TestCommand('actual')).collect()).toEqual(
      [],
    )
  })

  test('completes when a responder returns without any explicit signal', async () => {
    gatewayA.register(TestCommand, (_e, { send }) => {
      send('a')
      send('b')
    })
    expect(await gatewayB.invoke(new TestCommand('x')).collect()).toEqual([
      'a',
      'b',
    ])
  })

  test('waits for an async responder to settle before completing', async () => {
    gatewayA.register(TestCommand, async (_e, { send }) => {
      send('first')
      await Promise.resolve()
      await Promise.resolve()
      send('second')
    })
    expect(await gatewayB.invoke(new TestCommand('x')).collect()).toEqual([
      'first',
      'second',
    ])
  })

  test('a throwing responder rejects the stream when no onError is given', async () => {
    gatewayA.register(TestCommand, () => {
      throw new Error('boom')
    })
    await expect(
      gatewayB.invoke(new TestCommand('x')).collect(),
    ).rejects.toThrow('boom')
  })

  test('onError isolates a throwing responder and the stream still completes', async () => {
    gatewayA.register(TestCommand, () => {
      throw new Error('boom')
    })
    gatewayB.register(TestCommand, (_e, { send }) => send('ok'))

    const onError = vi.fn()
    const items = await gatewayB
      .invoke(new TestCommand('x'), { onError })
      .collect()

    expect(items).toEqual(['ok'])
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect((onError.mock.calls[0][0] as Error).message).toBe('boom')
  })

  test('onError also catches a rejected async responder', async () => {
    gatewayA.register(TestCommand, async () => {
      throw new Error('async boom')
    })

    const onError = vi.fn()
    const items = await gatewayA
      .invoke(new TestCommand('x'), { onError })
      .collect()

    expect(items).toEqual([])
    expect((onError.mock.calls[0][0] as Error).message).toBe('async boom')
  })

  test('onError receives an error from every failing responder across gateways', async () => {
    gatewayA.register(TestCommand, () => {
      throw new Error('a')
    })
    gatewayB.register(TestCommand, () => {
      throw new Error('b')
    })

    const onError = vi.fn()
    await gatewayA.invoke(new TestCommand('x'), { onError }).collect()

    const messages = onError.mock.calls.map((c) => (c[0] as Error).message)
    expect(messages.sort()).toEqual(['a', 'b'])
  })

  test('completes across multiple gateways each streaming', async () => {
    gatewayA.register(TestCommand, (_e, { send }) => send('a'))
    gatewayB.register(TestCommand, async (_e, { send }) => {
      await Promise.resolve()
      send('b')
    })
    const items = await gatewayA.invoke(new TestCommand('x')).collect()
    expect(items.sort()).toEqual(['a', 'b'])
  })
})

describe('multiple interceptors', () => {
  test('are applied in a chain', async () => {
    gatewayA.intercept(TestMessage, (m) => new TestMessage(`${m.foo}-a`))
    gatewayB.intercept(TestMessage, (m) => new TestMessage(`${m.foo}-b`))
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    await gatewayB.emit(new TestMessage('start'))
    const received = spy.mock.calls[0]?.[0] as TestMessage
    expect(received.foo).toMatch(/^start-/)
  })

  test('a later interceptor can cancel after an earlier one transformed', async () => {
    gatewayA.intercept(TestMessage, (m) => new TestMessage(`${m.foo}-a`))
    gatewayB.intercept(TestMessage, () => CANCEL)
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    const result = await gatewayB.emit(new TestMessage('start'))
    expect(result).toBe(CANCEL)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('emit return value', () => {
  test('each call resolves to its own (possibly intercepted) message', async () => {
    gatewayA.intercept(TestMessage, (m) => new TestMessage(`i ${m.foo}`))
    const first = (await gatewayB.emit(new TestMessage('one'))) as TestMessage
    const second = (await gatewayB.emit(new TestMessage('two'))) as TestMessage
    expect(first.foo).toBe('i one')
    expect(second.foo).toBe('i two')
  })

  test('a cancelled emit resolves to CANCEL without leaking to later emits', async () => {
    gatewayA.intercept(TestMessage, { foo: 'kill' }, () => CANCEL)
    expect(await gatewayB.emit(new TestMessage('kill'))).toBe(CANCEL)
    const after = (await gatewayB.emit(new TestMessage('ok'))) as TestMessage
    expect(after.foo).toBe('ok')
  })
})

describe('until', () => {
  test('rejects when the gateway aborts before the message arrives', async () => {
    const promise = gatewayA.until(TestMessage)
    const reason = new Error('gone')
    gatewayB.abort('a', reason)
    await expect(promise).rejects.toBe(reason)
  })
})

class TestMessage implements Message {
  $name = 'test'
  constructor(readonly foo: string) {}
}

class TestCommand extends CommandMessage<string> {
  $name = 'test command'
  constructor(readonly foo: string) {
    super()
  }
}
