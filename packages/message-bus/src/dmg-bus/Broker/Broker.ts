import { Bus } from '../Bus.js'
import { DiscriminatedQueue } from '../DiscriminatedQueue.js'
import { EventClass, InvocationClass } from '../Event.js'
import { EventHandler } from './EventHandler.js'
import { InboundBroker } from './InboundBroker.js'
import { InvocationHandler } from './InvocationHandler.js'
import { OutboundBroker } from './OutboundBroker.js'

export class Broker {
  readonly eventHandlers = new Map<EventClass, Set<EventHandler>>()

  readonly invokeHandlers = new Map<
    InvocationClass<unknown>,
    Set<InvocationHandler>
  >()

  readonly queue = new DiscriminatedQueue({})

  readonly inbound: InboundBroker

  readonly outbound: OutboundBroker

  constructor(
    readonly bus: Bus,
    readonly name: string,
    readonly abortSignal: AbortSignal,
  ) {
    this.inbound = new InboundBroker(this)
    this.outbound = new OutboundBroker(this)
    this.abortSignal.addEventListener('abort', () => {
      this.eventHandlers.clear()
      this.invokeHandlers.clear()
    })
  }
}
