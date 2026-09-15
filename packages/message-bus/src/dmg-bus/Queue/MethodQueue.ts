import { DiscriminatedQueue } from './DiscriminatedQueue.js'

export class MethodQueue extends DiscriminatedQueue<
  Record<symbol, { args: unknown[] }>
> {
  constructor() {
    super({})
  }

  queueMethod<Args extends unknown[]>(
    method: (...args: Args) => unknown,
  ): (...args: Args) => void {
    const type = Symbol()

    this.addExec(type, (item: { args: Args }) => {
      method(...item.args)
    })

    return (...args) => {
      this.push({ type, args })
    }
  }
}
