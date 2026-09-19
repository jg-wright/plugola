import type { MessageRegistry } from '../../src/Channel/MessageRegistry.ts'
import { Worker } from 'node:worker_threads'

/**
 * The shared message contract for the worker-bridge test. Both the main thread and
 * the worker call this against their own {@link MessageRegistry}, so the two ends
 * agree on `$name`s (the classes themselves are distinct per thread).
 */
export function defineContract(registry: MessageRegistry) {
  const Ready = registry.registerMessage<{ from: string }>('ready')
  const Sum = registry.registerCommand<{ a: number; b: number }, number>('sum')
  return { Ready, Sum }
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
