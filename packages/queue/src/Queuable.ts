import { MethodQueue } from './MethodQueue.ts'
import { Runnable } from './Runnable.ts'

export function QueuableMixin<C extends new (...args: any) => any>(
  Class: C,
): new (...args: ConstructorParameters<C>) => InstanceType<C> & Queuable {
  class QueuableClass extends Class implements Runnable {
    queue = new MethodQueue()
    get running() {
      return this.queue.running
    }
    resume() {
      this.queue.resume()
    }
    pause() {
      this.queue.pause()
    }
  }

  return QueuableClass
}

export class Queuable implements Runnable {
  readonly queue: MethodQueue
  constructor(queue = new MethodQueue()) {
    this.queue = queue
  }
  get running() {
    return this.queue.running
  }
  resume() {
    this.queue.resume()
  }
  pause() {
    this.queue.pause()
  }
}
