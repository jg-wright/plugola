import { setTimeout } from 'node:timers/promises'
import { beforeEach, describe, expect, Mock, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.js'
import { Message } from '../src/Message/Message.js'
import { CommandMessage } from '../src/Message/CommandMessage.js'
import { CANCEL } from '../src/Roles/Interceptor.js'
import type { ResponderContext } from '../src/Roles/Responder.js'
import type { MessageGateway } from '../src/Gateway/MessageGateway.js'

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
  const message = new TestMessage('bar')
  gatewayA.on(TestMessage, spy)
  gatewayB.emit(message)
  expect(spy).toHaveBeenCalledWith(message)
})

test('once', () => {
  const spy = vi.fn()
  const message = new TestMessage('bar')
  gatewayA.once(TestMessage, spy)
  gatewayA.emit(message)
  gatewayB.emit(message)
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][0]).toBe(message)
})

test('twice', () => {
  const spy = vi.fn()
  const message = new TestMessage('bar')
  gatewayA.on(TestMessage, spy)
  gatewayA.emit(message)
  gatewayB.emit(message)
  expect(spy).toHaveBeenCalledTimes(2)
})

test('until', async () => {
  const message = new TestMessage('bar')
  const promise = gatewayA.until(TestMessage)
  gatewayA.emit(message)
  expect(await promise).toEqual(message)
})

test('pause', () => {
  const spy = vi.fn()
  gatewayB.pause('a')
  gatewayA.on(TestMessage, spy)
  gatewayB.emit(new TestMessage('foo'))
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
      command: TestCommand,
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
      gatewayB.invoke(new TestCommand('thing')).collect(),
    ).resolves.toEqual(['one thing', 'two thing']))

  test('iterate', async () => {
    let result: string[] = []
    for await (const item of gatewayB
      .invoke(new TestCommand('thing'))
      .iterate()) {
      result.push(item)
    }
    expect(result).toEqual(['one thing', 'two thing'])
  })

  test('it emits the message as well', () => {
    const onSpy = vi.fn()
    const command = new TestCommand('bar')
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

    expect(await gatewayB.invoke(new TestCommand('foo')).collect()).toEqual([
      'one foo',
      'two foo',
      'foo',
      'bar',
    ])
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
        .invoke(new TestCommand('foo'), { signal: AbortSignal.timeout(10) })
        .collect(),
    ).toEqual(['one foo', 'two foo', 'hello foo'])
  })
})

describe('intercept', () => {
  test('cancelling', async () => {
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    gatewayB.intercept(TestMessage, () => CANCEL)
    await gatewayB.emit(new TestMessage('foo'))
    expect(spy).not.toHaveBeenCalled()
  })

  test('changing the message', async () => {
    const spy = vi.fn()
    gatewayA.on(TestMessage, spy)
    gatewayB.intercept(
      TestMessage,
      (message) => new TestMessage(`Intercepted ${message.foo}`),
    )
    await gatewayB.emit(new TestMessage('foo'))
    expect(spy).toHaveBeenCalledWith(new TestMessage('Intercepted foo'))
  })

  test('changing commands', async () => {
    const spy = vi.fn()
    gatewayA.register(TestCommand, (command) => {
      spy(command)
    })
    gatewayB.intercept(
      TestCommand,
      (command) => new TestCommand(`Intercepted ${command.foo}`),
    )
    await gatewayB.invoke(new TestCommand('foo')).collect()
    expect(spy).toHaveBeenCalledWith(new TestCommand('Intercepted foo'))
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
