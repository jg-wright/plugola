import { setTimeout } from 'node:timers/promises'
import { beforeEach, describe, expect, Mock, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'
import { CANCEL } from '../src/Roles/Interceptor.ts'
import type { ResponderContext } from '../src/Roles/Responder.ts'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'

const TestMessage = message<{ foo: string }>('test')
const TestCommand = command<{ foo: string }, string>('test command')

let gatewayA: MessageGateway
let gatewayB: MessageGateway

beforeEach(() => {
  const bus = new MessageBus()
  gatewayA = bus.gateway('a')
  gatewayB = bus.gateway('b')
  bus.resume()
})

test('emit', () => {
  const spy = vi.fn()
  const message = new TestMessage({ foo: 'bar' })
  gatewayA.on(TestMessage, spy)
  gatewayB.emit(message)
  expect(spy).toHaveBeenCalledWith(message)
})

test('once', () => {
  const spy = vi.fn()
  const message = new TestMessage({ foo: 'bar' })
  gatewayA.once(TestMessage, spy)
  gatewayA.emit(message)
  gatewayB.emit(message)
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][0]).toBe(message)
})

test('twice', () => {
  const spy = vi.fn()
  const message = new TestMessage({ foo: 'bar' })
  gatewayA.on(TestMessage, spy)
  gatewayA.emit(message)
  gatewayB.emit(message)
  expect(spy).toHaveBeenCalledTimes(2)
})

test('until', async () => {
  const message = new TestMessage({ foo: 'bar' })
  const promise = gatewayA.until(TestMessage)
  gatewayA.emit(message)
  expect(await promise).toEqual(message)
})

test('pause', () => {
  const spy = vi.fn()
  gatewayB.pause('a')
  gatewayA.on(TestMessage, spy)
  gatewayB.emit(new TestMessage({ foo: 'foo' }))
  expect(spy).not.toHaveBeenCalled()
  gatewayB.resume('a')
  expect(spy).toHaveBeenCalled()
})

test('abort', () => {
  const spy = vi.fn()
  gatewayA.abortSignal.addEventListener('abort', spy)
  gatewayB.abort('a')
  expect(spy).toHaveBeenCalled()
})

describe('invoke', () => {
  let spy: Mock<
    (
      command: InstanceType<typeof TestCommand>,
      context: ResponderContext<typeof TestCommand>,
    ) => void
  >

  beforeEach(() => {
    spy = vi.fn((command, { send }) => {
      send(`one ${command.foo}`)
      send(`two ${command.foo}`)
    })

    gatewayA.register(TestCommand, spy)
  })

  test('collect', () =>
    expect(
      gatewayB.invoke(new TestCommand({ foo: 'thing' })).collect(),
    ).resolves.toEqual(['one thing', 'two thing']))

  test('iterate', async () => {
    let result: string[] = []
    for await (const item of gatewayB
      .invoke(new TestCommand({ foo: 'thing' }))
      .iterate()) {
      result.push(item)
    }
    expect(result).toEqual(['one thing', 'two thing'])
  })

  test('it emits the message as well', () => {
    const onSpy = vi.fn()
    const command = new TestCommand({ foo: 'bar' })
    gatewayA.on(TestCommand, onSpy)
    gatewayB.invoke(command)
    expect(onSpy).toHaveBeenCalledWith(command)
  })

  test('multi registers', async () => {
    gatewayA.register(TestCommand, (_, { send }) => {
      send('foo')
    })

    gatewayB.register(TestCommand, (_, { send }) => {
      send('bar')
    })

    expect(
      await gatewayB.invoke(new TestCommand({ foo: 'foo' })).collect(),
    ).toEqual(['one foo', 'two foo', 'foo', 'bar'])
  })

  test('timeouts', async () => {
    gatewayA.register(TestCommand, async (command, { send, signal }) => {
      send(`hello ${command.foo}`)
      try {
        await setTimeout(1_000, null, { signal })
      } catch (error) {}
      send(`hello again ${command.foo}`)
    })

    expect(
      await gatewayB
        .invoke(new TestCommand({ foo: 'foo' }), {
          signal: AbortSignal.timeout(10),
        })
        .collect(),
    ).toEqual(['one foo', 'two foo', 'hello foo'])
  })
})

describe('intercept', () => {
  test('cancelling', async () => {
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    gatewayB.intercept(TestMessage, () => CANCEL)
    await gatewayB.emit(new TestMessage({ foo: 'foo' }))
    expect(spy).not.toHaveBeenCalled()
  })

  test('changing the message', async () => {
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    gatewayB.intercept(
      TestMessage,
      (message) => new TestMessage({ foo: `Intercepted ${message.foo}` }),
    )
    await gatewayB.emit(new TestMessage({ foo: 'foo' }))
    expect(spy).toHaveBeenCalledWith(
      new TestMessage({ foo: 'Intercepted foo' }),
    )
  })

  test('changing commands', async () => {
    const spy = vi.fn()
    gatewayA.register(TestCommand, (command) => {
      spy(command)
    })
    gatewayB.intercept(
      TestCommand,
      (command) => new TestCommand({ foo: `Intercepted ${command.foo}` }),
    )
    await gatewayB.invoke(new TestCommand({ foo: 'foo' })).collect()
    expect(spy).toHaveBeenCalledWith(
      new TestCommand({ foo: 'Intercepted foo' }),
    )
  })
})
