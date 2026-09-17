import { DiscriminatedQueue } from './DiscriminatedQueue.js'
import type { Runnable } from './Runnable.js'

export class MethodQueue implements Runnable {
  #queue = new DiscriminatedQueue<Record<symbol, QueuedCall>>({})

  queueMethod<R, Args extends unknown[]>(
    method: (...args: Args) => R,
  ): (...args: Args) => Promise<Awaited<R>> {
    const type = Symbol()

    this.#queue = this.#queue.addExec(type, (item: QueuedCall<R, Args>) => {
      try {
        item.resolve(method(...item.args) as Awaited<R>)
      } catch (error) {
        item.reject(error)
      }
    }) as any

    return (...args) => {
      const { promise, resolve, reject } = Promise.withResolvers<Awaited<R>>()
      this.#queue.push({ type, args, resolve, reject } as QueuedCall & {
        type: symbol
      })
      return promise
    }
  }

  start() {
    this.#queue.start()
  }

  stop() {
    this.#queue.stop()
  }

  get running() {
    return this.#queue.running
  }
}

interface QueuedCall<R = unknown, Args extends unknown[] = unknown[]> {
  args: Args
  resolve: (value: Awaited<R>) => void
  reject: (reason: unknown) => void
}
