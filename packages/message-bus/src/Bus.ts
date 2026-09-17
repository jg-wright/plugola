import { Broker } from './Broker/Broker.js'
import { PluginBroker } from './Broker/PluginBroker.js'
import type { Event, EventClass, Invocation, InvocationClass } from './Event.js'
import {
  CANCEL,
  type InvocationErrorHandler,
  type InvocationListenerContext,
} from './EventListener.js'
import { getOrInsert } from './lang/Map.js'

/**
 * The message bus: the shared hub the host owns. It hands out a
 * {@link PluginBroker} per named participant, routes events / invocations /
 * interceptions between them, and controls their lifecycle.
 *
 * Each broker has its own queue, so brokers can be paused and resumed
 * independently. Brokers begin paused: nothing is delivered until the bus (or
 * the individual broker) is resumed, so wiring up subscriptions before
 * {@link Bus.resume} is safe.
 *
 * @example
 * ```ts
 * const bus = new Bus()
 * const a = bus.broker('a')
 * const b = bus.broker('b')
 * a.on(Ping, () => console.log('pong'))
 * bus.resume()
 * b.emit(new Ping())
 * ```
 */
export class Bus {
  readonly #brokers = new Map<string, Broker>()

  readonly #eventBrokers = new Map<EventClass, Set<string>>()

  readonly #invokeBrokers = new Map<InvocationClass<unknown>, Set<string>>()

  readonly #interceptBrokers = new Map<EventClass, Set<string>>()

  /**
   * Records that a broker is interested in an event class so {@link Bus.emit}
   * knows to route to it. Called by the broker facade when a listener is added;
   * returns a disposer that drops the routing entry.
   * @internal
   */
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

  /**
   * Records that a broker registered a handler for an invocation class so
   * {@link Bus.invoke} routes to it. Returns a disposer.
   * @internal
   */
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

  /**
   * Records that a broker wants to intercept an event class so {@link Bus.emit}
   * runs it through that broker before delivery. Returns a disposer.
   * @internal
   */
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

  /**
   * Creates a broker under `name` and returns its {@link PluginBroker} facade —
   * the object a participant uses to subscribe, emit, and invoke. Names are
   * unique for the bus's lifetime; a name frees up again once its broker is
   * aborted.
   *
   * @throws if a broker with `name` is already registered.
   */
  broker(name: string) {
    if (this.#brokers.has(name))
      throw new Error(`Broker "${name}" has already been registered`)

    const broker = new Broker(this, name)
    this.#brokers.set(name, broker)

    broker.onAbort(() => {
      this.#brokers.delete(name)
      for (const routes of [
        this.#eventBrokers,
        this.#invokeBrokers,
        this.#interceptBrokers,
      ])
        for (const brokerNames of routes.values()) brokerNames.delete(name)
    })

    return broker.createPluginFacade()
  }

  /**
   * Runs the event through every registered interceptor (in chain order) and
   * then delivers the final event to every subscribed broker. Resolves to the
   * event as it stood after interception, or {@link CANCEL} if an interceptor
   * cancelled it. Prefer `broker.emit`, which queues through the sender's broker;
   * this is the bus-level primitive it calls.
   * @internal
   */
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

  /**
   * Fans an invocation out to every broker that registered for it and resolves
   * once they have all settled. The broker set is snapshotted so a broker
   * (un)registering mid-flight can't move the target; a broker that has since
   * been removed simply contributes a resolved `undefined`. Prefer
   * `broker.invoke`, which wraps this in a stream; this is the bus-level
   * primitive it calls.
   * @internal
   */
  async invoke<T>(
    event: Invocation<T>,
    context: InvocationListenerContext<InvocationClass<T>>,
    reportError: InvocationErrorHandler,
  ): Promise<void> {
    const invokeBrokers = this.#invokeBrokers.get(
      event.constructor as InvocationClass<T>,
    )

    if (!invokeBrokers?.size) return

    await Promise.all(
      Array.from(invokeBrokers, (name) =>
        this.#brokers.get(name)?.invoke(event, context, reportError),
      ),
    )
  }

  /**
   * Permanently tears down the named broker: fires its abort signal, clears its
   * handlers, and removes it from all routing so its name can be reused. Unlike
   * {@link Bus.pause}, this cannot be undone.
   */
  abort(name: string, reason?: Error) {
    this.#brokers.get(name)?.abort(reason)
  }

  /**
   * Resumes brokers so queued and future messages are delivered. Brokers begin
   * paused, so this is also how you first bring the bus to life. With a `name`,
   * resumes just that broker; with no argument, resumes every broker on the bus.
   */
  resume(name?: string) {
    if (name === undefined)
      for (const broker of this.#brokers.values()) broker.resume()
    else this.#brokers.get(name)?.resume()
  }

  /**
   * Pauses brokers: their queues stop draining and inbound messages buffer until
   * resumed. With a `name`, pauses just that broker; with no argument, pauses
   * every broker on the bus. Reversible via {@link Bus.resume}.
   */
  pause(name?: string) {
    if (name === undefined)
      for (const broker of this.#brokers.values()) broker.pause()
    else this.#brokers.get(name)?.pause()
  }
}
