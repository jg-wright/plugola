import { MessageDispatcher } from './Gateway/MessageDispatcher.js'
import { MessageGateway } from './Gateway/MessageGateway.js'
import type { Message, MessageClass } from './Message/Message.js'
import type {
  CommandMessage,
  CommandMessageClass,
} from './Message/CommandMessage.js'
import { CANCEL } from './Roles/Interceptor.js'
import type {
  ResponderContext,
  ResponderErrorHandler,
} from './Roles/Responder.js'
import { getOrInsert } from './lang/Map.js'

/**
 * The message bus: the shared hub the host owns. It hands out a
 * {@link MessageGateway} per named participant, routes messages / commands /
 * interceptions between them, and controls their lifecycle.
 *
 * Each participant has its own queue, so participants can be paused and resumed
 * independently. Participants begin paused: nothing is delivered until the bus
 * (or the individual participant) is resumed, so wiring up subscriptions before
 * {@link MessageBus.resume} is safe.
 *
 * @example
 * ```ts
 * const bus = new MessageBus()
 * const a = bus.gateway('a')
 * const b = bus.gateway('b')
 * a.on(Ping, () => console.log('pong'))
 * bus.resume()
 * b.emit(new Ping())
 * ```
 */
export class MessageBus {
  readonly #dispatchers = new Map<string, MessageDispatcher>()

  readonly #subscriberRoutes = new Map<MessageClass, Set<string>>()

  readonly #responderRoutes = new Map<
    CommandMessageClass<unknown>,
    Set<string>
  >()

  readonly #interceptorRoutes = new Map<MessageClass, Set<string>>()

  /**
   * Records that a participant is interested in a message class so
   * {@link MessageBus.emit} knows to route to it. Called by the gateway facade
   * when a subscriber is added; returns a disposer that drops the routing entry.
   * @internal
   */
  readonly on = <M extends MessageClass>(
    gateway: MessageGateway,
    messageClass: M,
  ): (() => void) => {
    const routes = getOrInsert(this.#subscriberRoutes, messageClass, new Set())
    routes.add(gateway.name)
    return () => {
      this.#subscriberRoutes.get(messageClass)?.delete(gateway.name)
    }
  }

  /**
   * Records that a participant registered a responder for a command class so
   * {@link MessageBus.invoke} routes to it. Returns a disposer.
   * @internal
   */
  readonly register = <T>(
    gateway: MessageGateway,
    commandClass: CommandMessageClass<T>,
  ): (() => void) => {
    const routes = getOrInsert(this.#responderRoutes, commandClass, new Set())
    routes.add(gateway.name)
    return () => {
      this.#responderRoutes.get(commandClass)?.delete(gateway.name)
    }
  }

  /**
   * Records that a participant wants to intercept a message class so
   * {@link MessageBus.emit} runs it through that participant before delivery.
   * Returns a disposer.
   * @internal
   */
  readonly intercept = (
    gateway: MessageGateway,
    messageClass: MessageClass,
  ): (() => void) => {
    const routes = getOrInsert(this.#interceptorRoutes, messageClass, new Set())
    routes.add(gateway.name)
    return () => {
      this.#interceptorRoutes.get(messageClass)?.delete(gateway.name)
    }
  }

  /**
   * Creates a participant under `name` and returns its {@link MessageGateway}
   * facade — the object a participant uses to subscribe, emit, and invoke. Names
   * are unique for the bus's lifetime; a name frees up again once its participant
   * is aborted.
   *
   * @throws if a participant with `name` is already registered.
   */
  gateway(name: string, abortSignal?: AbortSignal) {
    if (this.#dispatchers.has(name))
      throw new Error(`Gateway "${name}" has already been registered`)

    const dispatcher = new MessageDispatcher(this, name, abortSignal)
    this.#dispatchers.set(name, dispatcher)

    dispatcher.onAbort(() => {
      this.#dispatchers.delete(name)
      for (const routes of [
        this.#subscriberRoutes,
        this.#responderRoutes,
        this.#interceptorRoutes,
      ])
        for (const names of routes.values()) names.delete(name)
    })

    return dispatcher.createGateway()
  }

  /**
   * Runs the message through every registered interceptor (in chain order) and
   * then delivers the final message to every subscribed participant. Resolves to
   * the message as it stood after interception, or {@link CANCEL} if an
   * interceptor cancelled it. Prefer `gateway.emit`, which queues through the
   * sender's queue; this is the bus-level primitive it calls.
   * @internal
   */
  async emit<M extends Message>(message: M): Promise<M | typeof CANCEL> {
    const interceptorNames =
      this.#interceptorRoutes.get(message.constructor as MessageClass) ?? []

    for (const name of interceptorNames) {
      const result = await this.#dispatchers.get(name)?.runInterceptors(message)
      if (result === CANCEL) return CANCEL
      else if (result) message = result as M
    }

    const subscriberNames = this.#subscriberRoutes.get(
      message.constructor as MessageClass,
    )
    if (!subscriberNames?.size) return message

    for (const name of subscriberNames)
      this.#dispatchers.get(name)?.dispatch(message)

    return message
  }

  /**
   * Fans a command out to every participant that registered for it and resolves
   * once they have all settled. The participant set is snapshotted so a
   * participant (un)registering mid-flight can't move the target; a participant
   * that has since been removed simply contributes a resolved `undefined`. Prefer
   * `gateway.invoke`, which wraps this in a stream; this is the bus-level
   * primitive it calls.
   * @internal
   */
  async invoke<T>(
    command: CommandMessage<T>,
    context: ResponderContext<CommandMessageClass<T>>,
    reportError: ResponderErrorHandler,
  ): Promise<void> {
    const responderNames = this.#responderRoutes.get(
      command.constructor as CommandMessageClass<T>,
    )

    if (!responderNames?.size) return

    await Promise.all(
      Array.from(responderNames, (name) =>
        this.#dispatchers
          .get(name)
          ?.dispatchCommand(command, context, reportError),
      ),
    )
  }

  /**
   * Permanently tears down the named participant: fires its abort signal, clears
   * its handlers, and removes it from all routing so its name can be reused.
   * Unlike {@link MessageBus.pause}, this cannot be undone.
   */
  abort(name: string, reason?: Error) {
    this.#dispatchers.get(name)?.abort(reason)
  }

  /**
   * Resumes participants so queued and future messages are delivered.
   * Participants begin paused, so this is also how you first bring the bus to
   * life. With a `name`, resumes just that participant; with no argument, resumes
   * every participant on the bus.
   */
  resume(name?: string) {
    if (name === undefined)
      for (const dispatcher of this.#dispatchers.values()) dispatcher.resume()
    else this.#dispatchers.get(name)?.resume()
  }

  /**
   * Pauses participants: their queues stop draining and inbound messages buffer
   * until resumed. With a `name`, pauses just that participant; with no argument,
   * pauses every participant on the bus. Reversible via {@link MessageBus.resume}.
   */
  pause(name?: string) {
    if (name === undefined)
      for (const dispatcher of this.#dispatchers.values()) dispatcher.pause()
    else this.#dispatchers.get(name)?.pause()
  }
}
