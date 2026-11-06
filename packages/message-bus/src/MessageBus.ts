import { Participant } from './Participant/Participant.ts'
import type { Message, MessageFactory } from './Message/Message.ts'
import type {
  CommandMessage,
  CommandMessageFactory,
} from './Message/CommandMessage.ts'
import { CANCEL } from './Roles/Interceptor.ts'
import type {
  ResponderContext,
  ResponderErrorHandler,
} from './Roles/Responder.ts'
import { getOrInsert } from './lang/Map.ts'
import { chain, isPromiseLike } from './lang/chain.ts'
import { Queuable } from '@plugola/queue'
import type { BusEvent, BusObserver } from './Roles/Observer.ts'

/**
 * The message bus: the shared hub the host owns. It hands out a
 * {@link MessageGateway} per named participant, routes messages / commands /
 * interceptions between them, and controls their lifecycle.
 *
 * Each participant has its own queue, so participants can be paused and resumed
 * independently. Participants begin paused: nothing is delivered until the bus
 * (or the individual participant) is resumed, so wiring up subscriptions before
 * {@link MessageBus['resume']} is safe.
 *
 * @example
 * ```ts
 * const bus = new MessageBus()
 * const a = bus.gateway('a')
 * const b = bus.gateway('b')
 * a.on(Ping, () => console.log('pong'))
 * bus.resume()
 * b.emit(Ping())
 * ```
 */
export class MessageBus extends Queuable {
  /**
   * Receives a responder's error when `gateway.invoke` is given no `onError`.
   * Defaults to rethrowing, which fails the invoke's stream.
   */
  readonly onResponderError: ResponderErrorHandler

  readonly emit: <M extends Message>(
    message: M,
    from?: string,
    options?: { invoked?: boolean },
  ) => Promise<M | typeof CANCEL>

  readonly invoke: <T>(
    command: CommandMessage<T>,
    context: ResponderContext<CommandMessageFactory<T>>,
    reportError: ResponderErrorHandler,
  ) => Promise<void>

  constructor({
    onResponderError = rethrow,
  }: { onResponderError?: ResponderErrorHandler } = {}) {
    super()
    this.onResponderError = onResponderError
    this.emit = this.queue.queueMethod(this.#emit)
    this.invoke = this.queue.queueMethod(this.#invoke)
  }

  readonly #participants = new Map<string, Participant>()

  readonly #subscriberRoutes = new Map<MessageFactory, Set<string>>()

  readonly #responderRoutes = new Map<CommandMessageFactory, Set<string>>()

  readonly #interceptorRoutes = new Map<MessageFactory, Set<string>>()

  readonly #observers = new Set<BusObserver>()

  /**
   * Calls `observer` with every {@link BusEvent}: each message as it is
   * emitted, cancelled by an interceptor, delivered to a participant's
   * subscribers, or handed to a participant's responders. For tracing and
   * tests; an observer can't change what happens.
   *
   * @returns a disposer that removes the observer.
   */
  observe(observer: BusObserver) {
    this.#observers.add(observer)
    return () => {
      this.#observers.delete(observer)
    }
  }

  /**
   * Tells every observer about an event.
   * @internal
   */
  readonly notify = (event: BusEvent) => {
    for (const observer of this.#observers) observer(event)
  }

  /**
   * Records that a participant is interested in a message class so
   * {@link MessageBus.emit} knows to route to it. Called by the gateway facade
   * when a subscriber is added; returns a disposer that drops the routing entry.
   * @internal
   */
  readonly on = <M extends MessageFactory>(
    name: string,
    messageFactory: M,
  ): (() => void) => {
    const routes = getOrInsert(
      this.#subscriberRoutes,
      messageFactory,
      new Set(),
    )
    routes.add(name)
    return () => {
      this.#subscriberRoutes.get(messageFactory)?.delete(name)
    }
  }

  /**
   * Records that a participant registered a responder for a command class so
   * {@link MessageBus['invoke']} routes to it. Returns a disposer.
   * @internal
   */
  readonly register = <T>(
    name: string,
    commandFactory: CommandMessageFactory<T>,
  ): (() => void) => {
    const routes = getOrInsert(this.#responderRoutes, commandFactory, new Set())
    routes.add(name)
    return () => {
      this.#responderRoutes.get(commandFactory)?.delete(name)
    }
  }

  /**
   * Records that a participant wants to intercept a message class so
   * {@link MessageBus.emit} runs it through that participant before delivery.
   * Returns a disposer.
   * @internal
   */
  readonly intercept = (
    name: string,
    messageFactory: MessageFactory,
  ): (() => void) => {
    const routes = getOrInsert(
      this.#interceptorRoutes,
      messageFactory,
      new Set(),
    )
    routes.add(name)
    return () => {
      this.#interceptorRoutes.get(messageFactory)?.delete(name)
    }
  }

  /**
   * Creates a participant under `name` and returns its {@link MessageGateway}
   * facade — the object a participant uses to subscribe, emit, and invoke. Names
   * are unique for the bus's lifetime; a name frees up again once its participant
   * is aborted.
   * @throws if a participant with `name` is already registered.
   */
  gateway(name: string, abortSignal?: AbortSignal) {
    if (this.#participants.has(name))
      throw new Error(`Gateway "${name}" has already been registered`)

    const participant = new Participant(this, name, { abortSignal })
    this.#participants.set(name, participant)

    participant.onAbort(() => {
      this.#participants.delete(name)
      for (const routes of [
        this.#subscriberRoutes,
        this.#responderRoutes,
        this.#interceptorRoutes,
      ])
        for (const names of routes.values()) names.delete(name)
    })

    if (this.running) participant.resume()

    return participant.gateway
  }

  /**
   * Runs the message through every registered interceptor (in chain order) and
   * then delivers the final message to every subscribed participant. Resolves to
   * the message as it stood after interception, or {@link CANCEL} if an
   * interceptor cancelled it. Prefer `gateway.emit`, which queues through the
   * sender's queue; this is the bus-level primitive it calls.
   * @internal
   */
  readonly #emit = async <M extends Message>(
    message: M,
    from?: string,
    { invoked = false }: { invoked?: boolean } = {},
  ): Promise<M | typeof CANCEL> => {
    this.notify({ type: 'emit', message, from, invoked })

    const interceptorNames = [
      ...(this.#interceptorRoutes.get(message.$factory) ?? []),
    ]

    // Interceptors that return synchronously keep delivery synchronous.
    const intercepted = chain(interceptorNames, message, (name, message) =>
      this.#participants.get(name)?.dispatcher.runInterceptors(message),
    )
    const result = isPromiseLike(intercepted) ? await intercepted : intercepted
    if (result === CANCEL) {
      this.notify({ type: 'cancel', message })
      return CANCEL
    }
    message = result

    const subscriberNames = this.#subscriberRoutes.get(message.$factory)
    if (!subscriberNames?.size) return message

    for (const name of [...subscriberNames])
      this.#participants.get(name)?.dispatcher.dispatch(message)

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
  readonly #invoke = async <T>(
    command: CommandMessage<T>,
    context: ResponderContext<CommandMessageFactory<T>>,
    reportError: ResponderErrorHandler,
  ): Promise<void> => {
    const responderNames = this.#responderRoutes.get(
      command.$factory as CommandMessageFactory<T>,
    )

    if (!responderNames?.size) return

    await Promise.all(
      [...responderNames].map((name) =>
        this.#participants
          .get(name)
          ?.dispatcher.dispatchCommand(command, context, reportError),
      ),
    )
  }

  /**
   * Permanently tears down the named participant: fires its abort signal, clears
   * its handlers, and removes it from all routing so its name can be reused.
   * Unlike {@link MessageBus.prototype.pause}, this cannot be undone.
   */
  abort(name: string, reason?: Error) {
    this.#participants.get(name)?.abort(reason)
  }

  /**
   * Resumes participants so queued and future messages are delivered.
   * Participants begin paused, so this is also how you first bring the bus to
   * life. With a `name`, resumes just that participant; with no argument, resumes
   * every participant on the bus.
   *
   * Resuming every participant replays nothing until they are all running:
   * what each one buffered waits in the bus's own queue until the last has
   * resumed, so no buffered message skips a paused participant's interceptors
   * or responders.
   */
  override resume(name?: string) {
    if (name === undefined) {
      for (const participant of this.#participants.values())
        participant.resume()
      super.resume()
    } else this.#participants.get(name)?.resume()
  }

  /**
   * Pauses participants: their queues stop draining and inbound messages buffer
   * until resumed. With a `name`, pauses just that participant; with no argument,
   * pauses every participant on the bus. Reversible via {@link MessageBus.prototype.resume}.
   */
  override pause(name?: string) {
    if (name === undefined) {
      super.pause()
      for (const participant of this.#participants.values()) participant.pause()
    } else this.#participants.get(name)?.pause()
  }

  /**
   * Resumes the bus until the given promise settles, then pause again.
   */
  async resumeUntil(promise: Promise<unknown>) {
    this.resume()
    try {
      await promise
    } finally {
      this.pause()
    }
  }
}

function rethrow(error: unknown): never {
  throw error
}
