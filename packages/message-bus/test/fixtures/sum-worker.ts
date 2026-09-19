import { parentPort } from 'node:worker_threads'
import { MessageBus } from '../../src/MessageBus.ts'
import { MessageRegistry } from '../../src/Channel/MessageRegistry.ts'
import { MessagingBridge } from '../../src/Bridge/MessagingBridge.ts'
import { MessagePortChannel } from '../helpers/message-port-channel.ts'
import { defineContract } from './worker-contract.ts'

if (!parentPort) throw new Error('sum-worker must run as a worker thread')

const bus = new MessageBus()
const registry = new MessageRegistry()
const { Ready, Sum } = defineContract(registry)

let n = 0
new MessagingBridge(bus, new MessagePortChannel(parentPort), registry, {
  correlationId: () => `w${n++}`,
})

const app = bus.gateway('app')
app.register(Sum, (command, { send }) => send(command.a + command.b))
bus.resume()

// Announce readiness across the bridge so the main thread knows the worker's
// responder is wired up before it invokes.
app.emit(new Ready({ from: 'worker' }))
