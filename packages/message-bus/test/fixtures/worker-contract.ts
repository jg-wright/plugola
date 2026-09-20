import { Worker } from 'node:worker_threads'
import {
  MessagingBridge,
  MessageBus,
  MessageRegistry,
  PortChannel,
  type PortLike,
} from '../../src/index.ts'

export function createBridge(port: PortLike) {
  const bus = new MessageBus()
  const registry = new MessageRegistry()
  const Ready = registry.registerMessage<{ from: string }>('ready')
  const Sum = registry.registerCommand<{ a: number; b: number }, number>('sum')
  new MessagingBridge(bus, new PortChannel(port), registry)
  return { bus, Ready, Sum }
}

export function useWorker(): AsyncDisposable & { worker: Worker } {
  // The worker's source is loaded through Node's native TypeScript support in
  // strip-only mode (the default), so it must avoid transform-only syntax such
  // as parameter properties or enums. Node 26 removed `--experimental-transform-types`
  // altogether, so relying on that transform is no longer an option.
  const worker = new Worker(new URL('./sum-worker.ts', import.meta.url), {
    execArgv: ['--disable-warning=ExperimentalWarning'],
  })

  return {
    worker,
    async [Symbol.asyncDispose]() {
      await worker.terminate()
    },
  }
}
