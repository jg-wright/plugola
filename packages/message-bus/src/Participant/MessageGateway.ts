import type { UnderlyingDefaultSource } from 'node:stream/web'
import type { Message, MessageClass } from '../Message/Message.ts'
import type {
  CommandMessage,
  CommandMessageClass,
  ResponseType,
} from '../Message/CommandMessage.ts'
import { CANCEL } from '../Roles/Interceptor.ts'
import type { Interceptor } from '../Roles/Interceptor.ts'
import type { Subscriber } from '../Roles/Subscriber.ts'
import type {
  Responder,
  ResponderContext,
  ResponderErrorHandler,
} from '../Roles/Responder.ts'
import type { Serializable } from '../Message/Serializable.ts'
import type { Filter } from '../Filter.ts'
import type { MessageBus } from '../MessageBus.ts'
import type { Participant } from './Participant.ts'
import { onAbort } from '../lang/AbortSignal.ts'

/**
 * The outbound half of a {@link Participant} — what `bus.gateway(name)` returns.
 * Everything a participant does flows through here: subscribing to messages
 * ({@link MessageGateway.on}, {@link MessageGateway.once},
 * {@link MessageGateway.until}), publishing them ({@link MessageGateway.emit}),
 * transforming them in flight ({@link MessageGateway.intercept}), and the
 * request/stream pattern of {@link MessageGateway.register} +
 * {@link MessageGateway.invoke}. It writes the participant's
 * {@link PerformerRegistry} (which the {@link MessageDispatcher} reads) and
 * publishes onto the {@link MessageBus}.
 *
 * Outbound calls (`emit`, `invoke`) are queued through the participant's own
 * queue, so while it is paused they buffer and replay when it resumes. Every
 * subscription returns a disposer that removes it.
 */
export class MessageGateway {
  readonly #participant: Participant

  readonly #bus: MessageBus

  readonly #invoke: <E extends CommandMessageClass<unknown>>(
    command: InstanceType<E>,
    params: ResponderContext<E>,
    reportError: ResponderErrorHandler,
  ) => Promise<void>

  /**
   * Publishes a message to the whole bus. Runs any interceptors first, then
   * delivers to every participant subscribed to the message's class. Resolves to
   * the message as it stood after interception, or {@link CANCEL} if it was
   * cancelled. Queued through this participant, so it waits while it is paused.
   *
   * The message's payload must be {@link Serializable}, so that a subscriber
   * receiving it later (after the queue was paused) sees a faithful snapshot
   * rather than a possibly-stale live reference.
   */
  readonly emit: <M extends Message>(
    message: M & Serializable<M>,
  ) => Promise<M | typeof CANCEL>

  constructor(participant: Participant, bus: MessageBus) {
    this.#participant = participant
    this.#bus = bus

    this.#invoke = participant.queue.queueMethod(
      async (
        command: CommandMessage<unknown>,
        context: {
          send(value: any): void
          signal: AbortSignal
        },
        reportError: ResponderErrorHandler,
      ) => {
        const result = await bus.emit(command)
        if (result === CANCEL) return
        await bus.invoke(result, context, reportError)
      },
    )

    this.emit = participant.queue.queueMethod(<M extends Message>(message: M) =>
      bus.emit(message),
    )
  }

  /** This participant's unique name on the bus. */
  get name() {
    return this.#participant.name
  }

  /** The signal that fires when this participant is aborted; useful for teardown. */
  get abortSignal(): AbortSignal {
    return this.#participant.abortSignal
  }

  /**
   * Runs `fn` once, when this participant is aborted (immediately if it already
   * has). Returns a disposer that removes the listener.
   */
  onAbort(fn: (reason: any) => any) {
    return onAbort(fn, this.abortSignal)
  }

  /**
   * Resumes the named participant, draining its buffered messages. Participants
   * are addressed by name so one can control another's lifecycle.
   */
  resume(name: string) {
    this.#bus.resume(name)
  }

  /**
   * Pauses the named participant: its queue stops draining and inbound messages
   * buffer until {@link MessageGateway.resume}. Reversible.
   */
  pause(name: string) {
    this.#bus.pause(name)
  }

  /**
   * Permanently aborts the named participant — clears its handlers and frees its
   * name. Not reversible; use {@link MessageGateway.pause} to merely pause.
   */
  abort(name: string, reason?: any) {
    this.#bus.abort(name, reason)
  }

  /**
   * Subscribes `subscriber` to every message of `messageClass`.
   *
   * @returns a disposer that removes the subscription.
   * @example
   * ```ts
   * const off = gateway.on(UserLoggedIn, (m) => console.log(m.userId))
   * off() // unsubscribe
   * ```
   */
  on<M extends MessageClass>(
    messageClass: M,
    subscriber: Subscriber<M>,
  ): () => void

  /**
   * Subscribes only to messages matching `filter` (all keys must match — see
   * {@link Filter}).
   */
  on<M extends MessageClass>(
    messageClass: M,
    filter: Filter<M>,
    subscriber: Subscriber<M>,
  ): () => void

  on<M extends MessageClass>(
    messageClass: M,
    filterOrSubscriber: Filter<M> | Subscriber<M>,
    subscriber?: Subscriber<M>,
  ): () => void {
    return this.#addPerformer(
      this.#participant.registry.addSubscriber,
      this.#bus.on,
      messageClass,
      filterOrSubscriber,
      subscriber,
    )
  }

  /**
   * Like {@link MessageGateway.on}, but the subscriber fires at most once and
   * then unsubscribes itself.
   *
   * @returns a disposer, in case you want to cancel before it ever fires.
   */
  once<M extends MessageClass>(
    messageClass: M,
    subscriber: Subscriber<M>,
  ): () => void

  /** Fires once for the first message matching `filter`, then unsubscribes. */
  once<M extends MessageClass>(
    messageClass: M,
    filter: Filter<M>,
    subscriber: Subscriber<M>,
  ): () => void

  once<M extends MessageClass>(
    messageClass: M,
    filterOrSubscriber: Filter<M> | Subscriber<M>,
    subscriber?: Subscriber<M>,
  ): () => void {
    const filter = (subscriber ? filterOrSubscriber : {}) as Filter<M>
    subscriber ??= filterOrSubscriber as Subscriber<M>
    const off = this.on(messageClass, filter, (message) => {
      subscriber(message)
      off()
    })
    return off
  }

  /**
   * Resolves with the next message of `messageClass` (optionally matching
   * `filter`). Rejects with the abort reason if this participant is aborted while
   * waiting.
   *
   * @example
   * ```ts
   * const ready = await gateway.until(AppReady)
   * ```
   */
  until<M extends MessageClass>(
    messageClass: M,
    filter: Filter<M> = {},
  ): Promise<InstanceType<M>> {
    return new Promise((resolve, reject) => {
      const { aborted, off } = onAbort(reject, this.abortSignal)
      if (!aborted)
        this.once(messageClass, filter, (message) => {
          off()
          resolve(message)
        })
    })
  }

  /**
   * Registers a responder that streams values back for a {@link CommandMessage}.
   * Many participants can register for the same command; a caller's
   * {@link MessageGateway.invoke} collects the values from all of them (a
   * scatter-gather). The command completes for this responder when the function
   * returns (or its promise settles).
   *
   * @returns a disposer that removes the responder.
   * @example
   * ```ts
   * gateway.register(ListFiles, async (command, { send, signal }) => {
   *   for (const f of await readdir(command.dir, { signal })) send(f)
   * })
   * ```
   */
  register<E extends CommandMessageClass<unknown>>(
    commandClass: E,
    responder: Responder<E>,
  ): () => void

  /** Registers a responder only for commands matching `filter`. */
  register<E extends CommandMessageClass<unknown>>(
    commandClass: E,
    filter: Filter<E>,
    responder: Responder<E>,
  ): () => void

  register<E extends CommandMessageClass<unknown>>(
    commandClass: E,
    filterOrResponder: Filter<E> | Responder<E>,
    responder?: Responder<E>,
  ): () => void {
    return this.#addPerformer(
      this.#participant.registry.addResponder,
      this.#bus.register,
      commandClass,
      filterOrResponder,
      responder,
    )
  }

  /**
   * Intercepts messages of `messageClass` before their subscribers run. The
   * interceptor may return a replacement message, {@link CANCEL} to drop it, or
   * nothing to leave it unchanged (see {@link InterceptorResult}). Interceptors
   * across participants form a chain, each seeing the previous one's result.
   * Because a {@link CommandMessage} is emitted before it is invoked,
   * intercepting its class transforms or cancels commands too.
   *
   * @returns a disposer that removes the interceptor.
   */
  intercept<M extends MessageClass>(
    messageClass: M,
    interceptor: Interceptor<M>,
  ): () => void

  /** Intercepts only messages matching `filter`. */
  intercept<M extends MessageClass>(
    messageClass: M,
    filter: Filter<M>,
    interceptor: Interceptor<M>,
  ): () => void

  intercept<M extends MessageClass | CommandMessageClass<unknown>>(
    messageClass: M,
    filterOrInterceptor: Filter<M> | Interceptor<M>,
    interceptor?: Interceptor<M>,
  ): () => void {
    return this.#addPerformer(
      this.#participant.registry.addInterceptor,
      this.#bus.intercept,
      messageClass,
      filterOrInterceptor,
      interceptor,
    )
  }

  /**
   * Emits a command and streams back the values every registered responder
   * `send`s (a scatter-gather). Nothing runs until you consume the result, via
   * either `collect()` (a promise of all values) or `iterate()` (an async
   * iterable that yields them as they arrive). The stream completes once every
   * responder across every participant has settled.
   *
   * Errors are fail-loud by default: an unobserved responder error rejects the
   * stream. Pass `onError` to isolate responders instead — errors are reported
   * there and the stream still completes with the healthy responders' values.
   * Pass `signal` to cancel; the same signal is forwarded to responders so they
   * can abort in-flight work.
   *
   * @example
   * ```ts
   * const files = await gateway.invoke(new ListFiles('/tmp')).collect()
   *
   * for await (const file of gateway.invoke(new ListFiles('/tmp')).iterate()) {
   *   console.log(file)
   * }
   * ```
   */
  invoke<E extends CommandMessage<unknown>>(
    command: E & Serializable<E>,
    {
      signal,
      onError = (error) => {
        throw error
      },
    }: {
      signal?: AbortSignal
      onError?: ResponderErrorHandler
    } = {},
  ): {
    collect(): Promise<ResponseType<E>[]>
    iterate(): AsyncIterable<ResponseType<E>, undefined>
  } {
    type T = ResponseType<E>

    const readableStream = new ReadableStream(
      new ResponseSource(this, command, this.#invoke, onError, signal),
    )

    return {
      collect: async () => {
        const items: T[] = []
        for await (const item of readableStream) items.push(item)
        return items
      },

      iterate: () => readableStream.values(),
    }
  }

  #addPerformer<
    Add extends (
      messageClass: any,
      filter: Filter<MessageClass>,
      callback: any,
    ) => () => boolean,
  >(
    add: Add,
    subscribe: (name: string, messageClass: any) => () => void,
    messageClass: unknown,
    filterOrCallback: unknown,
    callback?: unknown,
  ) {
    const filter = (callback ? filterOrCallback : {}) as Filter<MessageClass>
    callback ??= filterOrCallback

    const removePerformer = add(messageClass, filter, callback)
    const unregister = subscribe(this.name, messageClass)

    return () => {
      if (removePerformer()) unregister()
    }
  }
}

class ResponseSource<
  E extends CommandMessage<unknown>,
> implements UnderlyingDefaultSource<ResponseType<E>> {
  readonly #producer = new AbortController()
  #settled = false
  #teardown = (_reason: any) => {}

  constructor(
    private readonly gateway: MessageGateway,
    private readonly command: E,
    private readonly invoke: (
      command: E,
      params: ResponderContext<CommandMessageClass>,
      reportError: ResponderErrorHandler,
    ) => Promise<void>,
    private readonly onError: ResponderErrorHandler,
    private readonly signal?: AbortSignal,
  ) {}

  start(controller: ReadableStreamDefaultController<ResponseType<E>>) {
    let aborted = false
    let offAbort = () => {}
    let offGatewayAbort = () => {}

    this.#teardown = (reason: any) => {
      if (this.#settled) return
      this.#settled = true
      offAbort()
      offGatewayAbort()
      this.#producer.abort(reason)
    }
    ;({ aborted, off: offGatewayAbort } = this.gateway.onAbort(() =>
      this.#abort(controller),
    ))
    if (aborted) return
    ;({ aborted, off: offAbort } = onAbort(
      () => this.#close(controller),
      this.signal,
    ))
    if (aborted) return

    // Completion is the settling of #invoke's promise: it resolves once
    // every responder across every participant has returned, and rejects if
    // one of them threw.
    this.invoke(
      this.command,
      {
        send: (value: unknown) => {
          if (this.#settled) return
          controller.enqueue(value as ResponseType<E>)
        },
        signal: this.#producer.signal,
      },
      this.onError,
    ).then(
      () => this.#close(controller),
      (reason: any) => this.#abort(controller, reason),
    )
  }

  cancel(reason: any) {
    this.#teardown(reason)
  }

  #close(controller: ReadableStreamDefaultController<ResponseType<E>>) {
    if (this.#settled) return
    this.#teardown(this.signal?.reason)
    controller.close()
  }

  #abort(
    controller: ReadableStreamDefaultController<ResponseType<E>>,
    reason = this.gateway.abortSignal.reason,
  ) {
    if (this.#settled) return
    this.#teardown(reason)
    controller.error(reason)
  }
}
