import { expect, test } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { MessageRegistry } from '../src/Channel/MessageRegistry.ts'
import { MessagingBridge } from '../src/Bridge/MessagingBridge.ts'
import { MessagePortChannel } from './helpers/message-port-channel.ts'
import { defineContract, useWorker } from './fixtures/worker-contract.ts'

// Bridges a bus on the main thread to a bus in a real node:worker_threads Worker
// over postMessage — the end-to-end proof that a message and a command survive an
// actual thread boundary (structured clone), not just the in-memory loopback.
test('bridges messages and commands to a real Worker thread', async () => {
  await using resource = useWorker()

  const abortController = new AbortController()
  resource.worker.on('error', (err) => abortController.abort(err))

  const bus = new MessageBus()
  const registry = new MessageRegistry()
  const { Ready, Sum } = defineContract(registry)

  let n = 0
  new MessagingBridge(bus, new MessagePortChannel(resource.worker), registry, {
    correlationId: () => `m${n++}`,
  })
  const app = bus.gateway('app', abortController.signal)
  bus.resume()

  // The worker relays a Ready message once its responder is wired up.
  const ready = await app.until(Ready)
  expect(ready.from).toBe('worker')

  // A command invoked here reaches the worker's responder and streams back.
  const results = await app.invoke(new Sum({ a: 7, b: 8 })).collect()
  expect(results).toEqual([15])
}, 20_000)
