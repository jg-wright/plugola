import type { Queue } from './Queue.ts'

export function Asyncable<C extends new (...args: any[]) => Queue<any, any>>(
  Class: C,
  onError?: (error: unknown) => void,
): C {
  class AsyncQueue extends Class {
    #promise: Promise<unknown> = Promise.resolve()
    #resumed = Promise.withResolvers<void>()

    override pause() {
      if (this.running) this.#resumed = Promise.withResolvers()
      super.pause()
    }

    override resume() {
      this.#resumed.resolve()
      super.resume()
    }

    protected override execItems(exec: (item: any) => any, items: any[]) {
      while (this.running && items.length > 0) {
        const item = items.shift()
        const promise = this.#promise
          .then(this.#whenRunning)
          .then(() => exec(item))
        this.#promise = onError ? promise.catch(onError) : promise
      }
    }

    readonly #whenRunning = async () => {
      while (!this.running) await this.#resumed.promise
    }
  }

  return AsyncQueue
}
