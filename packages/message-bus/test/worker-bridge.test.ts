import { expect, test } from 'vitest'
import { createBridge, useWorker } from './fixtures/worker-contract.ts'

// Bridges a bus on the main thread to a bus in a real node:worker_threads Worker
// over postMessage — the end-to-end proof that a message and a command survive an
// actual thread boundary (structured clone), not just the in-memory loopback.
test('bridges messages and commands to a real Worker thread', async () => {
  await using resource = useWorker()

  const abortController = new AbortController()
  resource.worker.on('error', (err) => abortController.abort(err))

  const { bus, Ready, Sum } = createBridge(resource.worker)
  const app = bus.gateway('app', abortController.signal)
  bus.resume()

  // The worker relays a Ready message once its responder is wired up.
  const ready = await app.until(Ready)
  expect(ready.from).toBe('worker')

  // A command invoked here reaches the worker's responder and streams back.
  const results = await app.invoke(Sum({ a: 7, b: 8 })).collect()
  expect(results).toEqual([15])
}, 20_000)
