import { beforeEach, describe, expect, Mock, test, vi } from 'vitest'
import { setImmediate } from 'node:timers/promises'
import Broker from '../src/Broker.js'
import MessageBus from '../src/MessageBus.js'
import { CancelEvent } from '../src/symbols.js'
import { AbortError, timeout } from '@johngw/async'
import MessageBusError from '../src/MessageBusError.js'
import { CreateEvents } from '../src/types/events.js'
import { CreateMessageBusContext } from '../src/types/MessageBus.js'
import { CreateInvokablesDict } from '../src/types/invokables.js'
import { CreateEventGenerators } from '../src/types/generators.js'
import { write } from '@johngw/stream'

describe('events', () => {
  type Events = CreateEvents<{ foo: []; bar: [string]; mung: [string, number] }>
  let messageBus: MessageBus<CreateMessageBusContext<{ events: Events }>>
  let broker: Broker<CreateMessageBusContext<{ events: Events }>>
  let foo: Mock<() => void>
  let bar: Mock<(x: string) => void>

  beforeEach(() => {
    messageBus = new MessageBus()
    broker = messageBus.broker('test')
    foo = vi.fn()
    bar = vi.fn()
    broker.on('foo', foo)
    broker.on('bar', bar)
  })

  test('events', () => {
    messageBus.start()
    broker.emit('foo')
    broker.emit('bar', 'hello world')
    expect(foo).toHaveBeenCalled()
    expect(bar).toHaveBeenCalledWith('hello world', expect.any(AbortSignal))
  })

  test('queued events', () => {
    broker.emit('foo')
    broker.emit('bar', 'hello world')

    expect(foo).not.toHaveBeenCalled()
    expect(bar).not.toHaveBeenCalled()

    messageBus.start()
    expect(foo).toHaveBeenCalled()
    expect(bar).toHaveBeenCalledWith('hello world', expect.any(AbortSignal))
  })

  test('can wait for all asynchronous listeners', async () => {
    const fn = vi.fn()
    messageBus.start()
    broker.on('foo', async () => {
      await timeout()
      fn()
    })
    await broker.emit('foo')
    expect(fn).toHaveBeenCalled()
  })

  test('once listeners', () => {
    const fn = vi.fn()
    messageBus.start()
    broker.once('foo', fn)
    broker.emit('foo')
    broker.emit('foo')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('until listeners', async () => {
    messageBus.start()
    const result = broker.until('bar')
    broker.emit('bar', 'hello')
    expect(await result).toEqual(['hello', expect.any(AbortSignal)])
  })

  test('partial until listeners', async () => {
    const fn = vi.fn()
    messageBus.start()
    broker.until('bar', 'hello').then(fn)
    broker.emit('bar', 'no')
    await setImmediate()
    expect(fn).not.toHaveBeenCalled()
    broker.emit('bar', 'hello')
    await setImmediate()
    expect(fn).toHaveBeenCalledWith([expect.any(AbortSignal)])
  })

  test('intercepting events', async () => {
    messageBus.start()
    broker.interceptEvent('bar', (x) => [x + '1'])
    await broker.emit('bar', 'hello')
    expect(bar).toHaveBeenCalledWith('hello1', expect.any(AbortSignal))
  })

  test('cancelling events with interception', async () => {
    messageBus.start()
    broker.interceptEvent(
      'foo',
      async (): Promise<typeof CancelEvent> => CancelEvent,
    )
    await broker.emit('foo')
    expect(foo).not.toHaveBeenCalled()
  })

  test('partial subscribers', () => {
    const fn = vi.fn()
    messageBus.start()
    broker.on('mung', 'face', fn)
    broker.emit('mung', 'mung', 1)
    broker.emit('mung', 'face', 2)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(2, expect.any(AbortSignal))
  })

  test('aborting removes subscribers', () => {
    messageBus.start()
    broker.abort()
    broker.emit('foo')
    expect(foo).not.toHaveBeenCalled()
  })

  test('aborting cancels queued emits', async () => {
    const onAbort = vi.fn()
    broker.emit('foo')
    broker.abort()
    messageBus.onError(onAbort)
    await messageBus.start()
    expect(foo).not.toHaveBeenCalled()
    expect(onAbort).toHaveBeenCalled()
    expect(onAbort.mock.calls[0][0].message).toBe(
      'test[foo]: Async operation was aborted',
    )
  })
})

describe('iterators', () => {
  type Iterables = CreateEventGenerators<{
    foo: { args: []; yield: string }
    bar: { args: [string]; yield: string }
  }>
  let messageBus: MessageBus<CreateMessageBusContext<{ generators: Iterables }>>
  let broker: Broker<CreateMessageBusContext<{ generators: Iterables }>>

  beforeEach(() => {
    messageBus = new MessageBus()
    broker = messageBus.broker('test')
  })

  test('yielding', async () => {
    const results = []

    broker.generator('foo', async function* () {
      yield 'hello'
      yield 'world'
    })

    broker.generator('foo', async function* () {
      yield 'moo'
      yield 'car'
    })

    messageBus.start()
    for await (const result of broker.iterate('foo')) {
      results.push(result)
    }

    expect(results).toEqual(['hello', 'world', 'moo', 'car'])
  })

  test('partial subscribers', async () => {
    const results = []

    broker.generator('bar', async function* (str) {
      yield str
    })

    broker.generator('bar', 'mung', async function* () {
      yield 'face'
    })

    broker.generator('bar', 'shouldIgnore', async function* () {
      yield 'ERROR'
    })

    messageBus.start()
    for await (const result of broker.iterate('bar', 'mung')) {
      results.push(result)
    }

    expect(results).toEqual(['mung', 'face'])
  })
})

describe('invokables', () => {
  type Invokables = CreateInvokablesDict<{
    foo: { args: []; return: string }
    bar: { args: [string]; return: string }
    afoo: { args: [string]; return: string }
    never: { args: []; return: Promise<never> }
  }>
  let messageBus: MessageBus<
    CreateMessageBusContext<{ invokables: Invokables }>
  >
  let broker: Broker<CreateMessageBusContext<{ invokables: Invokables }>>
  let foo: Mock<() => string>
  let bar: Mock<(x: string) => string>

  beforeEach(() => {
    messageBus = new MessageBus()
    broker = messageBus.broker('test')
    foo = vi.fn(() => 'foo')
    bar = vi.fn((x: string) => x + '1')
    broker.register('foo', foo)
    broker.register('bar', bar)
    broker.register(
      'never',
      (abortSignal) =>
        new Promise((_, reject) => {
          abortSignal.onabort = () => reject(new AbortError())
        }),
    )
  })

  test('returning values', async () => {
    messageBus.start()
    expect(await broker.invoke('foo')).toEqual('foo')
    expect(await broker.invoke('bar', 'hello')).toEqual('hello1')
  })

  test('queued messages', async () => {
    const promise = broker.invoke('foo')
    messageBus.start()
    expect(await promise).toBe('foo')
  })

  test('invoking unregistered', async () => {
    messageBus.start()
    try {
      // @ts-ignore
      await broker.invoke('not register')
    } catch (error) {
      expect(error).toHaveProperty(
        'message',
        'Cannot find matching invoker for "not register".',
      )
      return
    }
    throw new Error('Invoking an unregistered endpoint should error')
  })

  test('registering more than once', () => {
    expect(() => {
      broker.register('foo', () => 'foo')
    }).toThrowError()

    broker.register('afoo', 'foo', () => 'foo')
    broker.register('afoo', 'mung', () => 'face')

    expect(() => {
      broker.register('afoo', 'foo', () => 'foo')
    }).toThrowError()
  })

  test('intercept invokers', async () => {
    messageBus.start()
    broker.interceptInvoker('bar', (next, x) => next(x + '1'))
    expect(await broker.invoke('bar', 'hello')).toEqual('hello11')
  })

  test('intercepting with indexed parameters', async () => {
    messageBus.start()
    const match = 'hello'
    broker.interceptInvoker('bar', match, async (next) => {
      const result = await next(match)
      return result + ' foo'
    })
    expect(await broker.invoke('bar', 'no intercept')).toEqual('no intercept1')
    expect(await broker.invoke('bar', 'hello')).toEqual('hello1 foo')
  })

  test('aborting will throw AbortError', async () => {
    messageBus.start()
    const result = broker.invoke('never')
    broker.abort()
    await expect(result).rejects.toThrow('Async operation was aborted')
  })
})

describe('error handling', () => {
  type Events = { foo: []; bar: [string] }
  let messageBus: MessageBus<CreateMessageBusContext<{ events: Events }>>
  let broker: Broker<CreateMessageBusContext<{ events: Events }>>

  beforeEach(() => {
    messageBus = new MessageBus()
    broker = messageBus.broker('test')
  })

  test('immediately throing errors inside subscribers', () =>
    new Promise<void>((resolve) => {
      messageBus.start()
      messageBus.onError((error) => {
        expect(error).toBeInstanceOf(MessageBusError)
        expect(error.message).toBe('test[foo]: Foo errored')
        resolve()
      })
      broker.on('foo', () => {
        throw new Error('Foo errored')
      })
      broker.emit('foo')
    }))

  test('queuing errors inside subscribers', () =>
    new Promise<void>((resolve) => {
      messageBus.onError((error) => {
        expect(error).toBeInstanceOf(MessageBusError)
        expect(error.message).toBe('test[foo]: Foo errored')
        resolve()
      })
      broker.on('foo', () => {
        throw new Error('Foo errored')
      })
      broker.emit('foo')
      messageBus.start()
    }))
})

describe('streams', () => {
  type Streamables = { foo: { args: [number]; item: string } }
  let messageBus: MessageBus<CreateMessageBusContext<{ streams: Streamables }>>
  let broker: Broker<CreateMessageBusContext<{ streams: Streamables }>>

  beforeEach(() => {
    messageBus = new MessageBus()
    messageBus.start()
    broker = messageBus.broker('test')
  })

  test('single reader', async () => {
    const fn = vi.fn()

    broker.reader('foo', (x) => ({
      start(controller) {
        controller.enqueue(x.toString())
        controller.close()
      },
    }))

    await broker.stream('foo', 100).pipeTo(write(fn))

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0][0]).toBe('100')
  })

  test('multiple readers', async () => {
    const fn = vi.fn()

    broker.reader('foo', (x) => ({
      start(controller) {
        controller.enqueue(x.toString())
        controller.close()
      },
    }))

    broker.reader('foo', (x) => ({
      start(controller) {
        controller.enqueue(x.toString())
        controller.close()
      },
    }))

    await broker.stream('foo', 100).pipeTo(write(fn))

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[0][0]).toBe('100')
    expect(fn.mock.calls[1][0]).toBe('100')
  })

  test('aborting', async () => {
    broker.reader('foo', (x) => ({
      start(controller) {
        controller.enqueue(x.toString())
        controller.close()
      },
    }))

    const promise = broker.stream('foo', 100).pipeTo(write())

    broker.abort()

    await expect(promise).rejects.toThrow()
  })

  test('specification filtering', async () => {
    const fn = vi.fn()

    broker.reader('foo', 10, () => ({
      start(controller) {
        controller.enqueue('10')
        controller.close()
      },
    }))

    broker.reader('foo', (x) => ({
      start(controller) {
        controller.enqueue(x.toString())
        controller.close()
      },
    }))

    await broker.stream('foo', 100).pipeTo(write(fn))

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0][0]).toBe('100')
  })

  test('specification applying', async () => {
    const fn = vi.fn()

    broker.reader('foo', 10, () => ({
      start(controller) {
        controller.enqueue('10')
        controller.close()
      },
    }))

    broker.reader('foo', (x) => ({
      start(controller) {
        controller.enqueue(x.toString())
        controller.close()
      },
    }))

    await broker.stream('foo', 10).pipeTo(write(fn))

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[0][0]).toBe('10')
    expect(fn.mock.calls[1][0]).toBe('10')
  })
})
