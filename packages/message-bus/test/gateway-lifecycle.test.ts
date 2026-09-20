import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { CANCEL } from '../src/Roles/Interceptor.ts'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'
import { message } from '../src/Message/Message.ts'
import type { MessageOf } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'

const TestMessage = message<{ foo: string }>('test')
const TestCommand = command<{ foo: string }, string>('test')

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
    gatewayB.emit(TestMessage({ foo: 'one' }))
    off()
    gatewayB.emit(TestMessage({ foo: 'two' }))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('a disposed subscriber does not resubscribe on a later emit', () => {
    const spy = vi.fn()
    const off = gatewayA.on(TestMessage, spy)
    off()
    gatewayB.emit(TestMessage({ foo: 'x' }))
    gatewayB.emit(TestMessage({ foo: 'y' }))
    expect(spy).not.toHaveBeenCalled()
  })

  test('intercept() returns a disposer', async () => {
    const spy = vi.fn((m: MessageOf<typeof TestMessage>) =>
      TestMessage({ foo: `i ${m.foo}` }),
    )
    const off = gatewayA.intercept(TestMessage, spy)
    off()
    const onSpy = vi.fn()
    gatewayB.on(TestMessage, onSpy)
    await gatewayB.emit(TestMessage({ foo: 'foo' }))
    expect(spy).not.toHaveBeenCalled()
    expect(onSpy).toHaveBeenCalledWith(TestMessage({ foo: 'foo' }))
  })
})

describe('abort', () => {
  test('clears the aborted gateway’s subscribers', () => {
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    gatewayB.abort('a')
    gatewayB.emit(TestMessage({ foo: 'foo' }))
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
    gatewayB.emit(TestMessage({ foo: 'foo' }))
    expect(spy).not.toHaveBeenCalled()
    gatewayB.resume('a')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('a paused gateway does not intercept', async () => {
    const spy = vi.fn((m: MessageOf<typeof TestMessage>) =>
      TestMessage({ foo: `i ${m.foo}` }),
    )
    gatewayA.intercept(TestMessage, spy)
    gatewayB.pause('a')
    const onSpy = vi.fn()
    gatewayB.on(TestMessage, onSpy)
    await gatewayB.emit(TestMessage({ foo: 'foo' }))
    expect(spy).not.toHaveBeenCalled()
    expect(onSpy).toHaveBeenCalledWith(TestMessage({ foo: 'foo' }))
  })
})

describe('invoke completion', () => {
  test('collect resolves to [] when there are no registrants', async () => {
    expect(await gatewayB.invoke(TestCommand({ foo: 'x' })).collect()).toEqual(
      [],
    )
  })

  test('collect resolves to [] when the only registrant is paused', async () => {
    gatewayA.register(TestCommand, (_e, { send }) => {
      send('nope')
    })
    gatewayB.pause('a')
    expect(await gatewayB.invoke(TestCommand({ foo: 'x' })).collect()).toEqual(
      [],
    )
  })

  test('a filtered-out responder does not hang the stream', async () => {
    // Regression: completion is per-responder settling, so a responder whose
    // filter rejects the command completes immediately instead of deadlocking
    // collect().
    gatewayA.register(TestCommand, { foo: 'never' }, (_e, { send }) => {
      send('nope')
    })
    expect(
      await gatewayB.invoke(TestCommand({ foo: 'actual' })).collect(),
    ).toEqual([])
  })

  test('completes when a responder returns without any explicit signal', async () => {
    gatewayA.register(TestCommand, (_e, { send }) => {
      send('a')
      send('b')
    })
    expect(await gatewayB.invoke(TestCommand({ foo: 'x' })).collect()).toEqual([
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
    expect(await gatewayB.invoke(TestCommand({ foo: 'x' })).collect()).toEqual([
      'first',
      'second',
    ])
  })

  test('a throwing responder rejects the stream when no onError is given', async () => {
    gatewayA.register(TestCommand, () => {
      throw new Error('boom')
    })
    await expect(
      gatewayB.invoke(TestCommand({ foo: 'x' })).collect(),
    ).rejects.toThrow('boom')
  })

  test('onError isolates a throwing responder and the stream still completes', async () => {
    gatewayA.register(TestCommand, () => {
      throw new Error('boom')
    })
    gatewayB.register(TestCommand, (_e, { send }) => send('ok'))

    const onError = vi.fn()
    const items = await gatewayB
      .invoke(TestCommand({ foo: 'x' }), { onError })
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
      .invoke(TestCommand({ foo: 'x' }), { onError })
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
    await gatewayA.invoke(TestCommand({ foo: 'x' }), { onError }).collect()

    const messages = onError.mock.calls.map((c) => (c[0] as Error).message)
    expect(messages.sort()).toEqual(['a', 'b'])
  })

  test('completes across multiple gateways each streaming', async () => {
    gatewayA.register(TestCommand, (_e, { send }) => send('a'))
    gatewayB.register(TestCommand, async (_e, { send }) => {
      await Promise.resolve()
      send('b')
    })
    const items = await gatewayA.invoke(TestCommand({ foo: 'x' })).collect()
    expect(items.sort()).toEqual(['a', 'b'])
  })
})

describe('multiple interceptors', () => {
  test('are applied in a chain', async () => {
    gatewayA.intercept(TestMessage, (m) => TestMessage({ foo: `${m.foo}-a` }))
    gatewayB.intercept(TestMessage, (m) => TestMessage({ foo: `${m.foo}-b` }))
    const spy = vi.fn<(message: MessageOf<typeof TestMessage>) => void>()
    gatewayA.on(TestMessage, spy)
    await gatewayB.emit(TestMessage({ foo: 'start' }))
    const received = spy.mock.calls[0]?.[0]
    expect(received.foo).toMatch(/^start-/)
  })

  test('a later interceptor can cancel after an earlier one transformed', async () => {
    gatewayA.intercept(TestMessage, (m) => TestMessage({ foo: `${m.foo}-a` }))
    gatewayB.intercept(TestMessage, () => CANCEL)
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    const result = await gatewayB.emit(TestMessage({ foo: 'start' }))
    expect(result).toBe(CANCEL)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('emit return value', () => {
  test('each call resolves to its own (possibly intercepted) message', async () => {
    gatewayA.intercept(TestMessage, (m) => TestMessage({ foo: `i ${m.foo}` }))
    const first = (await gatewayB.emit(
      TestMessage({ foo: 'one' }),
    )) as MessageOf<typeof TestMessage>
    const second = (await gatewayB.emit(
      TestMessage({ foo: 'two' }),
    )) as MessageOf<typeof TestMessage>
    expect(first.foo).toBe('i one')
    expect(second.foo).toBe('i two')
  })

  test('a cancelled emit resolves to CANCEL without leaking to later emits', async () => {
    gatewayA.intercept(TestMessage, { foo: 'kill' }, () => CANCEL)
    expect(await gatewayB.emit(TestMessage({ foo: 'kill' }))).toBe(CANCEL)
    const after = (await gatewayB.emit(
      TestMessage({ foo: 'ok' }),
    )) as MessageOf<typeof TestMessage>
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
