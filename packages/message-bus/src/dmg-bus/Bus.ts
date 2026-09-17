import { Broker } from './Broker/Broker.js'
import { PluginBroker } from './Broker/PluginBroker.js'
import type { Event, EventClass, Invocation, InvocationClass } from './Event.js'
import { CANCEL } from './EventListener.js'
import { withCounter } from './lang/Function.js'
import { getOrInsert } from './lang/Map.js'

export class Bus {
  readonly #brokers = new Map<string, Broker>()

  readonly #eventBrokers = new Map<EventClass, Set<string>>()

  readonly #invokeBrokers = new Map<InvocationClass<unknown>, Set<string>>()

  readonly #interceptBrokers = new Map<EventClass, Set<string>>()

  readonly on = <E extends EventClass>(
    broker: PluginBroker,
    eventClass: E,
  ): (() => void) => {
    const eventBrokers = getOrInsert(this.#eventBrokers, eventClass, new Set())
    eventBrokers.add(broker.name)
    return () => {
      this.#eventBrokers.get(eventClass)?.delete(broker.name)
    }
  }

  readonly register = <T>(
    broker: PluginBroker,
    eventClass: InvocationClass<T>,
  ): (() => void) => {
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

  readonly intercept = (
    broker: PluginBroker,
    eventClass: EventClass,
  ): (() => void) => {
    const interceptBrokers = getOrInsert(
      this.#interceptBrokers,
      eventClass,
      new Set(),
    )
    interceptBrokers.add(broker.name)
    return () => {
      this.#interceptBrokers.get(eventClass)?.delete(broker.name)
    }
  }

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

    return broker.createPluginFacade()
  }

  async emit<E extends Event>(event: E): Promise<E | typeof CANCEL> {
    const interceptorBrokers =
      this.#interceptBrokers.get(event.constructor as EventClass) ?? []

    for (const name of interceptorBrokers) {
      const result = await this.#brokers.get(name)?.intercept(event)
      if (result === CANCEL) return CANCEL
      else if (result) event = result as E
    }

    const eventBrokers = this.#eventBrokers.get(event.constructor as EventClass)
    if (!eventBrokers?.size) return event

    for (const name of eventBrokers) this.#brokers.get(name)?.emit(event)

    return event
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

    const brokerContext = {
      ...context,
      finish: withCounter((counter) => {
        if (counter >= invokeBrokers.size) context.finish()
      }),
    }

    for (const name of invokeBrokers)
      this.#brokers.get(name)?.invoke(event, brokerContext)
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
