import { DiscriminatedQueue } from './DiscriminatedQueue.js'
import type { Runnable } from './Runnable.js'

export class MethodQueue implements Runnable {
  #queue = new DiscriminatedQueue<Record<symbol, { args: unknown[] }>>({})

  queueMethod<Args extends unknown[]>(
    method: (...args: Args) => unknown,
  ): (...args: Args) => void {
    const type = Symbol()

    this.#queue = this.#queue.addExec(type, (item: { args: unknown[] }) => {
      method(...(item.args as Args))
    }) as any

    return (...args) => {
      this.#queue.push({ type, args })
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
