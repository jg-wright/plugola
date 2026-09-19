import { Worker } from 'node:worker_threads'
import {
  MessagingBridge,
  MessageBus,
  MessageRegistry,
} from '../../src/index.ts'
import {
  MessagePortChannel,
  type PortLike,
} from '../helpers/message-port-channel.ts'

export function createBridge(port: PortLike) {
  const bus = new MessageBus()
  const registry = new MessageRegistry()
  const Ready = registry.registerMessage<{ from: string }>('ready')
  const Sum = registry.registerCommand<{ a: number; b: number }, number>('sum')
  new MessagingBridge(bus, new MessagePortChannel(port), registry)
  return { bus, Ready, Sum }
}

export function useWorker(): AsyncDisposable & { worker: Worker } {
  const worker = new Worker(new URL('./sum-worker.ts', import.meta.url), {
    execArgv: [
      '--experimental-transform-types',
      '--disable-warning=ExperimentalWarning',
    ],
  })

  return {
    worker,
    async [Symbol.asyncDispose]() {
      await worker.terminate()
    },
  }
}
