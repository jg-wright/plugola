import { parentPort } from 'node:worker_threads'
import { createBridge } from './worker-contract.ts'

if (!parentPort) throw new Error('sum-worker must run as a worker thread')

const { bus, Ready, Sum } = createBridge(parentPort)

const app = bus.gateway('app')
app.register(Sum, (command, { send }) => send(command.a + command.b))
bus.resume()

// Announce readiness across the bridge so the main thread knows the worker's
// responder is wired up before it invokes.
app.emit(new Ready({ from: 'worker' }))
