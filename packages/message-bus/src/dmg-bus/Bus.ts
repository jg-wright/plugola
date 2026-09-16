import { Broker } from './Broker/Broker.js'
import { PluginBroker } from './Broker/PluginBroker.js'
import type { Event, EventClass, Invocation, InvocationClass } from './Event.js'
import { withCounter } from './lang/Function.js'
import { getOrInsert } from './lang/Map.js'

export class Bus {
  #brokers = new Map<string, Broker>()

  #eventBrokers = new Map<EventClass, Set<string>>()

  #invokeBrokers = new Map<InvocationClass<unknown>, Set<string>>()

  broker(name: string) {
    if (this.#brokers.has(name))
      throw new Error(`Broker "${name}" has already been registered`)

    const broker = new Broker(this, name)
    this.#brokers.set(name, broker)

    broker.onAbort(() => {
      this.#brokers.delete(name)
      for (const brokerNames of this.#eventBrokers.values())
        brokerNames.delete(name)
      for (const brokerNames of this.#invokeBrokers.values())
        brokerNames.delete(name)
    })

    return new PluginBroker(broker)
  }

  on<E extends EventClass>(broker: PluginBroker, eventClass: E): () => void {
    const eventBrokers = getOrInsert(this.#eventBrokers, eventClass, new Set())
    eventBrokers.add(broker.name)
    return () => {
      this.#eventBrokers.get(eventClass)?.delete(broker.name)
    }
  }

  emit<E extends Event>(event: E) {
    const eventBrokers = this.#eventBrokers.get(event.constructor as EventClass)
    if (!eventBrokers?.size) return
    for (const name of eventBrokers) this.#brokers.get(name)?.emit(event)
  }

  register<T>(
    broker: PluginBroker,
    eventClass: InvocationClass<T>,
  ): () => void {
    const invokeBrokers = getOrInsert(
      this.#invokeBrokers,
      eventClass,
      new Set(),
    )
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
      this.#brokers.get(name)?.invoke(event, { ...context, finish })
  }

  abort(name: string, reason?: Error) {
    this.#brokers.get(name)?.abort(reason)
  }

  start(name?: string) {
    if (name === undefined)
      for (const broker of this.#brokers.values()) broker.start()
    else this.#brokers.get(name)?.start()
  }

  stop(name?: string) {
    if (name === undefined)
      for (const broker of this.#brokers.values()) broker.stop()
    else this.#brokers.get(name)?.stop()
  }
}
