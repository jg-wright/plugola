import { DiscriminatedQueue } from './DiscriminatedQueue.js'
import type { Runnable } from './Runnable.js'

export class MethodQueue implements Runnable {
  #queue = new DiscriminatedQueue<Record<symbol, { args: unknown[] }>>({})

  queueMethod<R, Args extends unknown[]>(
    method: (...args: Args) => R,
  ): (...args: Args) => Promise<Awaited<R>> {
    const type = Symbol()
    const { promise, resolve } = Promise.withResolvers<Awaited<R>>()

    this.#queue = this.#queue.addExec(type, (item: { args: unknown[] }) => {
      resolve(method(...(item.args as Args)) as Awaited<R>)
    }) as any

    return (...args) => {
      this.#queue.push({ type, args })
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
