import type { Bus } from '../Bus.js'
import { DiscriminatedQueue } from '../DiscriminatedQueue.js'
import { EventClass, InvocationClass } from '../Event.js'
import { EventHandler } from './EventHandler.js'
import { InboundBroker } from './InboundBroker.js'
import { InvocationHandler } from './InvocationHandler.js'
import { OutboundBroker } from './OutboundBroker.js'

export function brokerFactory(name: string, bus: Bus) {
  const abortController = new AbortController()
  const eventHandlers = new Map<EventClass, Set<EventHandler>>()
  const invocationHandlers = new Map<
    InvocationClass<unknown>,
    Set<InvocationHandler>
  >()
  const queue = new DiscriminatedQueue({})
  return {
    abortController,
    inboundBroker: new InboundBroker(
      bus,
      name,
      abortController.signal,
      eventHandlers,
      invocationHandlers,
      queue,
    ),
    outboundBroker: new OutboundBroker(
      bus,
      name,
      abortController.signal,
      eventHandlers,
      invocationHandlers,
      queue,
    ),
  }
}
