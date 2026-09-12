import { Event, EventClass, Invocation, InvocationClass } from '../Event.js'
import { withCounter } from '../Function.js'
import { queueMethod } from '../queuedMethods.js'
import { Broker } from './Broker.js'

export class InboundBroker {
  readonly #broker: Broker

  readonly emit: (event: Event) => void

  constructor(broker: Broker) {
    this.#broker = broker

    this.emit = queueMethod(this.#broker.queue, (event: Event) => {
      for (const eventHandler of this.#broker.eventHandlers.get(
        event.constructor as EventClass,
      ) ?? [])
        eventHandler.handle(event)
    })
  }

  invoke<T>(
    event: Invocation<T>,
    context: {
      finish: () => void
      send: (value: any) => void
      signal?: AbortSignal
    },
  ) {
    if (!this.#broker.queue.running) return context.finish()

    const invokeHandlers = this.#broker.invokeHandlers.get(
      event.constructor as InvocationClass<T>,
    )

    if (!invokeHandlers?.size) return context.finish()

    const finish = withCounter((counter) => {
      if (counter >= invokeHandlers.size) context.finish()
    })

    for (const invokeHandler of invokeHandlers)
      invokeHandler.handle(event, { ...context, finish })
  }

  start() {
    this.#broker.queue.start()
  }

  stop() {
    this.#broker.queue.stop()
  }
}
