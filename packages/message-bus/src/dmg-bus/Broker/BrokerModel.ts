import type { Bus } from '../Bus.js'
import type { EventClass, InvocationClass } from '../Event.js'
import type { EventHandler } from './EventHandler.js'
import type { InvocationHandler } from './InvocationHandler.js'
import { MethodQueue } from '../Queue/MethodQueue.js'

export class BrokerModel {
  readonly eventHandlers = new Map<EventClass, Set<EventHandler>>()

  readonly invokeHandlers = new Map<
    InvocationClass<unknown>,
    Set<InvocationHandler>
  >()

  readonly queue = new MethodQueue()

  constructor(
    readonly bus: Bus,
    readonly name: string,
    readonly abortSignal: AbortSignal,
  ) {
    abortSignal.addEventListener('abort', () => {
      this.eventHandlers.clear()
      this.invokeHandlers.clear()
    })
  }
}
