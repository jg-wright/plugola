import { Queue } from './Queue.ts'

export class MethodQueue extends Queue<() => any> {
  constructor() {
    super((fn) => fn())
  }

  queueMethod<R, Args extends unknown[]>(
    method: (...args: Args) => R,
  ): (...args: Args) => Promise<Awaited<R>> {
    return (...args) => this.push(() => method(...args))
  }

  override push<R>(fn: () => R): Promise<Awaited<R>> {
    const { promise, resolve, reject } = Promise.withResolvers<Awaited<R>>()
    super.push(() => {
      try {
        resolve(fn() as Awaited<R>)
      } catch (error) {
        reject(error)
      }
    })
    return promise
  }
}
