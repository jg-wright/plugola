import { beforeEach, expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { MessageRegistry } from '../src/Channel/MessageRegistry.ts'
import { LoopbackChannel } from '../src/Channel/LoopbackChannel.ts'
import { MessagingBridge } from '../src/Bridge/MessagingBridge.ts'
import { message } from '../src/Message/Message.ts'
import type { MessageClass } from '../src/Message/Message.ts'
import type { CommandMessageClass } from '../src/Message/CommandMessage.ts'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'

const flush = () => new Promise((resolve) => setTimeout(resolve))

let registry: MessageRegistry
let Clicked: MessageClass<{ x: number }>
let Sum: CommandMessageClass<number, { a: number; b: number }>
let busA: MessageBus
let busB: MessageBus
let bridgeA: MessagingBridge
let appA: MessageGateway
let appB: MessageGateway

beforeEach(() => {
  registry = new MessageRegistry()
  Clicked = registry.registerMessage<{ x: number }>('clicked')
  Sum = registry.registerCommand<{ a: number; b: number }, number>('sum')

  const [chA, chB] = LoopbackChannel.pair()
  busA = new MessageBus()
  busB = new MessageBus()
  bridgeA = new MessagingBridge(busA, chA, registry)
  new MessagingBridge(busB, chB, registry)

  appA = busA.gateway('app')
  appB = busB.gateway('app')
  busA.resume()
  busB.resume()
})

test('a message emitted on one bus is delivered on the other, decoded', async () => {
  const spy = vi.fn()
  appB.on(Clicked, spy)

  appA.emit(new Clicked({ x: 1 }))
  await flush()

  expect(spy).toHaveBeenCalledTimes(1)
  const [received] = spy.mock.calls[0]
  expect(received).toBeInstanceOf(Clicked)
  expect(received.x).toBe(1)
})

test('bridging is bidirectional', async () => {
  const onA = vi.fn()
  const onB = vi.fn()
  appA.on(Clicked, onA)
  appB.on(Clicked, onB)

  appB.emit(new Clicked({ x: 2 }))
  await flush()

  expect(onA).toHaveBeenCalledTimes(1)
  expect(onA.mock.calls[0][0].x).toBe(2)
})

test('a message from the wire is not relayed back (no echo)', async () => {
  const onA = vi.fn()
  const onB = vi.fn()
  appA.on(Clicked, onA)
  appB.on(Clicked, onB)

  appA.emit(new Clicked({ x: 1 }))
  await flush()
  await flush() // give any echo extra time to (not) arrive

  expect(onA).toHaveBeenCalledTimes(1) // its own local emit only
  expect(onB).toHaveBeenCalledTimes(1) // the single forwarded copy
})

test('forwarded messages still go through normal routing and filters', async () => {
  const spy = vi.fn()
  appB.on(Clicked, { x: 1 }, spy)

  appA.emit(new Clicked({ x: 2 })) // filtered out on B
  await flush()
  expect(spy).not.toHaveBeenCalled()

  appA.emit(new Clicked({ x: 1 })) // matches
  await flush()
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a message outside the registry is not relayed', async () => {
  const Unregistered = message<{ x: number }>('unregistered')

  const spy = vi.fn()
  appB.on(Unregistered, spy)

  appA.emit(new Unregistered({ x: 1 }))
  await flush()

  expect(spy).not.toHaveBeenCalled() // the bridge never subscribed to it
})

test('a paused peer buffers wire messages until resumed', async () => {
  busB.pause()
  const spy = vi.fn()
  appB.on(Clicked, spy)

  appA.emit(new Clicked({ x: 1 }))
  await flush()
  expect(spy).not.toHaveBeenCalled()

  busB.resume()
  await flush()
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a command invoked on one bus reaches a responder on the other', async () => {
  appB.register(Sum, (command, { send }) => {
    send(command.a + command.b)
  })

  const results = await appA.invoke(new Sum({ a: 2, b: 3 })).collect()
  expect(results).toEqual([5])
})

test('a command scatter-gathers local and remote responders', async () => {
  appA.register(Sum, (command, { send }) => send(command.a + command.b)) // local
  appB.register(Sum, (command, { send }) => send((command.a + command.b) * 10)) // remote

  const results = await appA.invoke(new Sum({ a: 1, b: 1 })).collect()
  expect(results.sort((x, y) => x - y)).toEqual([2, 20])
})

test('a remote responder can stream several values, in order', async () => {
  appB.register(Sum, (command, { send }) => {
    send(command.a)
    send(command.b)
    send(command.a + command.b)
  })

  const results = await appA.invoke(new Sum({ a: 4, b: 5 })).collect()
  expect(results).toEqual([4, 5, 9])
})

test('a command with no remote responder completes empty', async () => {
  const results = await appA.invoke(new Sum({ a: 1, b: 2 })).collect()
  expect(results).toEqual([])
})

test('a throwing remote responder surfaces on the caller as a rejection', async () => {
  appB.register(Sum, () => {
    throw new Error('boom')
  })

  await expect(appA.invoke(new Sum({ a: 1, b: 2 })).collect()).rejects.toThrow(
    'boom',
  )
})

test('a remote command is not relayed back (no command echo)', async () => {
  const remote = vi.fn((command: InstanceType<typeof Sum>, { send }: any) =>
    send(command.a + command.b),
  )
  appB.register(Sum, remote)

  const results = await appA.invoke(new Sum({ a: 2, b: 2 })).collect()
  await flush()

  expect(results).toEqual([4])
  expect(remote).toHaveBeenCalledTimes(1) // invoked once on B, never bounced back
})

test('cancelling the caller aborts the remote responder', async () => {
  let remoteSignal: AbortSignal | undefined
  const started = new Promise<void>((resolve) => {
    appB.register(Sum, (_command, { signal }) => {
      remoteSignal = signal
      resolve()
      return new Promise<void>(() => {}) // never settles on its own
    })
  })

  const canceller = new AbortController()
  const collected = appA
    .invoke(new Sum({ a: 1, b: 2 }), { signal: canceller.signal })
    .collect()

  await started
  canceller.abort()
  await flush()

  expect(remoteSignal?.aborted).toBe(true)
  await expect(collected).resolves.toEqual([]) // caller's stream closes cleanly
})

test('aborting the bridge rejects in-flight commands', async () => {
  appB.register(Sum, () => new Promise<void>(() => {})) // never settles

  const collected = appA.invoke(new Sum({ a: 1, b: 2 })).collect()
  await flush() // command reaches the peer; the outbound command is pending on A

  bridgeA.abort()

  await expect(collected).rejects.toThrow(/aborted/)
})
