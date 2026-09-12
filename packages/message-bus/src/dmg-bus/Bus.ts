import { brokerFactory } from './Broker/Factory.js'
import { InboundBroker } from './Broker/InboundBroker.js'
import { OutboundBroker } from './Broker/OutboundBroker.js'
import { Event, EventClass, Invocation, InvocationClass } from './Event.js'
import { withCounter } from './Function.js'

export class Bus {
  #brokers = new Map<
    string,
    { broker: InboundBroker; abortController: AbortController }
  >()

  #eventBrokers = new Map<EventClass, Set<string>>()

  #invokeBrokers = new Map<InvocationClass<unknown>, Set<string>>()

  broker(name: string) {
    if (this.#brokers.has(name))
      throw new Error(`Broker "${name}" has already been registered`)

    const { abortController, inboundBroker, outboundBroker } = brokerFactory(
      name,
      this,
    )

    this.#brokers.set(name, { broker: inboundBroker, abortController })

    abortController.signal.addEventListener('abort', () => {
      this.#brokers.delete(name)
      for (const brokerNames of this.#eventBrokers.values()) {
        brokerNames.delete(name)
      }
    })

    return outboundBroker
  }

  on<E extends EventClass>(broker: OutboundBroker, eventClass: E): () => void {
    const eventBrokers = this.#eventBrokers.getOrInsert(eventClass, new Set())
    eventBrokers.add(broker.name)
    return () => {
      this.#eventBrokers.get(eventClass)?.delete(broker.name)
    }
  }

  emit<E extends Event>(event: E) {
    const eventBrokers = this.#eventBrokers.get(event.constructor as EventClass)
    if (!eventBrokers?.size) return
    for (const name of eventBrokers) this.#brokers.get(name)?.broker.emit(event)
  }

  register<T>(
    broker: OutboundBroker,
    eventClass: InvocationClass<T>,
  ): () => void {
    const invokeBrokers = this.#invokeBrokers.getOrInsert(eventClass, new Set())
    invokeBrokers.add(broker.name)
    return () => {
      this.#invokeBrokers.get(eventClass)?.delete(broker.name)
    }
  }

  invoke<T>(
    event: Invocation<T>,
    context: {
      send: (item: T) => void
      finish: () => void
      signal?: AbortSignal
    },
  ) {
    const invokeBrokers = this.#invokeBrokers.get(
      event.constructor as InvocationClass<T>,
    )

    if (!invokeBrokers?.size) return context.finish()

    const finish = withCounter((counter) => {
      if (counter >= invokeBrokers.size) context.finish()
    })

    for (const name of invokeBrokers)
      this.#brokers.get(name)?.broker.invoke(event, { ...context, finish })
  }

  abort(name: string, reason?: Error) {
    this.#brokers.get(name)?.abortController.abort(reason)
  }

  start(name?: string) {
    if (name === undefined)
      for (const { broker } of this.#brokers.values()) broker.start()
    else this.#brokers.get(name)?.broker.start()
  }

  stop(name?: string) {
    if (name === undefined)
      for (const { broker } of this.#brokers.values()) broker.stop()
    else this.#brokers.get(name)?.broker.stop()
  }
}
