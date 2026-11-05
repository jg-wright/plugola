import { afterEach, expect, test, vi } from 'vitest'
import { PostMessageChannel } from '../src/Channel/PostMessageChannel.ts'
import { MessagingBridge } from '../src/Bridge/MessagingBridge.ts'
import { MessageBus } from '../src/MessageBus.ts'
import { TransportableMessageRegistry } from '../src/MessageRegistry/TransportableMessageRegistry.ts'
import type { Frame } from '../src/Channel/Channel.ts'

// A MessageChannel's ports are the same EventTarget-style endpoint as a browser
// Worker and a worker's `self`: postMessage plus addEventListener('message').
let ports: MessagePort[] = []

afterEach(() => {
  for (const port of ports) port.close()
  ports = []
})

test('bridges messages and commands between the two ends', async () => {
  const [here, there] = pair()
  const registry = TransportableMessageRegistry.create()
    .message('ready')
    .as<{ from: string }>()
    .command('sum')
    .as<{ a: number; b: number }, number>()
  const { ready: Ready } = registry.messages
  const { sum: Sum } = registry.commands

  const page = new MessageBus()
  const worker = new MessageBus()
  new MessagingBridge(page, new PostMessageChannel(here), registry)
  new MessagingBridge(worker, new PostMessageChannel(there), registry)
  page.resume()
  worker.resume()

  const app = page.gateway('app')
  const inWorker = worker.gateway('worker')
  inWorker.register(Sum, ({ a, b }, { send }) => send(a + b))
  const isReady = app.until(Ready)
  inWorker.emit(Ready({ from: 'worker' }))

  expect(await isReady).toMatchObject({ from: 'worker' })
  expect(await app.invoke(Sum({ a: 2, b: 3 })).collect()).toEqual([5])
})

test('ignores anything posted that is not a frame', async () => {
  const [here, there] = pair()
  const handler = vi.fn()
  new PostMessageChannel(there).receive(handler)

  here.postMessage({ type: 'RPC', method: 'ready' })
  here.postMessage(null)
  new PostMessageChannel(here).send(ping)
  await delivered(handler)

  expect(handler).toHaveBeenCalledTimes(1)
  expect(handler).toHaveBeenCalledWith(ping)
})

test('the disposer stops delivery', async () => {
  const [here, there] = pair()
  const before = vi.fn()
  const after = vi.fn()
  const stop = new PostMessageChannel(there).receive(before)
  new PostMessageChannel(there).receive(after)

  stop()
  new PostMessageChannel(here).send(ping)
  await delivered(after)

  expect(before).not.toHaveBeenCalled()
})

const ping: Frame = { kind: 'message', name: 'ping', payload: {} }

function pair(): [MessagePort, MessagePort] {
  const { port1, port2 } = new MessageChannel()
  ports.push(port1, port2)
  return [port1, port2]
}

/** Waits until `handler` has been called, since a port delivers asynchronously. */
function delivered(handler: ReturnType<typeof vi.fn>) {
  return vi.waitFor(() => expect(handler).toHaveBeenCalled())
}
