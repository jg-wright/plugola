import { DiscriminatedQueue } from './DiscriminatedQueue.js'

export function queueMethod<Args extends unknown[]>(
  queue: DiscriminatedQueue<any>,
  method: (...args: Args) => unknown,
): (...args: Args) => void {
  const type = Symbol()

  queue.addExec(type, (item: { args: Args }) => {
    method(...item.args)
  })

  return (...args) => {
    queue.push({ type, args })
  }
}
