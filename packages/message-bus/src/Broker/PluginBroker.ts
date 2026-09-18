import { UnderlyingDefaultSource } from 'node:stream/web'
import type {
  Event,
  EventClass,
  Invocation,
  InvocationClass,
  InvocationType,
} from '../Event.js'
import {
  CANCEL,
  type EventListener,
  type InterceptionListener,
  type InvocationErrorHandler,
  type InvocationListener,
  type InvocationListenerContext,
} from '../EventListener.js'
import type { Filter } from '../Filter.js'
import { getOrInsert } from '../lang/Map.js'
import type { Broker } from './Broker.js'
import { Handler } from './Handler.js'
import { onAbort } from '../lang/AbortSignal.js'

/**
 * A participant's handle on the {@link Bus} — what `bus.broker(name)` returns.
 * Everything a plugin does flows through here: subscribing to events
 * ({@link PluginBroker.on}, {@link PluginBroker.once}, {@link PluginBroker.until}),
 * publishing them ({@link PluginBroker.emit}), transforming them in flight
 * ({@link PluginBroker.intercept}), and the request/stream pattern of
 * {@link PluginBroker.register} + {@link PluginBroker.invoke}.
 *
 * Outbound calls (`emit`, `invoke`) are queued through this broker's own queue,
 * so while the broker is paused they buffer and replay when it resumes. Every
 * subscription returns a disposer that removes it.
 */
export class PluginBroker {
  readonly #broker: Broker

  readonly #invoke: <E extends InvocationClass<unknown>>(
    event: InstanceType<E>,
    params: InvocationListenerContext<E>,
    reportError: InvocationErrorHandler,
  ) => Promise<void>

  /**
   * Publishes an event to the whole bus. Runs any interceptors first, then
   * delivers to every broker subscribed to the event's class. Resolves to the
   * event as it stood after interception, or {@link CANCEL} if it was cancelled.
   * Queued through this broker, so it waits while the broker is paused.
   */
  readonly emit: <E extends Event>(event: E) => Promise<E | typeof CANCEL>

  constructor(broker: Broker) {
    this.#broker = broker

    this.#invoke = broker.queue.queueMethod(
      async (
        event: Invocation<unknown>,
        context: {
          send(value: any): void
          signal: AbortSignal
        },
        reportError: InvocationErrorHandler,
      ) => {
        const result = await this.#broker.bus.emit(event)
        if (result === CANCEL) return
        await this.#broker.bus.invoke(result, context, reportError)
      },
    )

    this.emit = broker.queue.queueMethod(<E extends Event>(event: E) =>
      this.#broker.bus.emit(event),
    )
  }

  /** This broker's unique name on the bus. */
  get name() {
    return this.#broker.name
  }

  /** The signal that fires when this broker is aborted; useful for teardown. */
  get abortSignal(): AbortSignal {
    return this.#broker.abortSignal
  }

  /**
   * Runs `fn` once, when this broker is aborted (immediately if it already has).
   * Returns a disposer that removes the listener.
   */
  onAbort(fn: (reason: any) => any) {
    return onAbort(fn, this.abortSignal)
  }

  /**
   * Resumes the named broker, draining its buffered messages. Brokers are
   * addressed by name so one participant can control another's lifecycle.
   */
  resume(name: string) {
    this.#broker.bus.resume(name)
  }

  /**
   * Pauses the named broker: its queue stops draining and inbound messages
   * buffer until {@link PluginBroker.resume}. Reversible.
   */
  pause(name: string) {
    this.#broker.bus.pause(name)
  }

  /**
   * Permanently aborts the named broker — clears its handlers and frees its
   * name. Not reversible; use {@link PluginBroker.pause} to merely pause.
   */
  abort(name: string, reason?: any) {
    this.#broker.bus.abort(name, reason)
  }

  /**
   * Subscribes `eventListener` to every event of `eventClass`.
   *
   * @returns a disposer that removes the subscription.
   * @example
   * ```ts
   * const off = broker.on(UserLoggedIn, (e) => console.log(e.userId))
   * off() // unsubscribe
   * ```
   */
  on<E extends EventClass>(
    eventClass: E,
    eventListener: EventListener<E>,
  ): () => void

  /**
   * Subscribes only to events matching `filter` (all keys must match — see
   * {@link Filter}).
   */
  on<E extends EventClass>(
    eventClass: E,
    filter: Filter<E>,
    eventListener: EventListener<E>,
  ): () => void

  on<E extends EventClass>(
    eventClass: E,
    filterOrEventListener: Filter<E> | EventListener<E>,
    eventListener?: EventListener<E>,
  ): () => void {
    return this.#addListener(
      this.#broker.eventHandlers,
      this.#broker.bus.on,
      eventClass,
      filterOrEventListener,
      eventListener,
    )
  }

  /**
   * Like {@link PluginBroker.on}, but the listener fires at most once and then
   * unsubscribes itself.
   *
   * @returns a disposer, in case you want to cancel before it ever fires.
   */
  once<E extends EventClass>(
    eventClass: E,
    eventListener: EventListener<E>,
  ): () => void

  /** Fires once for the first event matching `filter`, then unsubscribes. */
  once<E extends EventClass>(
    eventClass: E,
    filter: Filter<E>,
    eventListener: EventListener<E>,
  ): () => void

  once<E extends EventClass>(
    eventClass: E,
    filterOrEventListener: Filter<E> | EventListener<E>,
    eventListener?: EventListener<E>,
  ): () => void {
    const filter = (eventListener ? filterOrEventListener : {}) as Filter<E>
    eventListener ??= filterOrEventListener as EventListener<E>
    const off = this.on(eventClass, filter, (event) => {
      eventListener(event)
      off()
    })
    return off
  }

  /**
   * Resolves with the next event of `eventClass` (optionally matching `filter`).
   * Rejects with the abort reason if this broker is aborted while waiting.
   *
   * @example
   * ```ts
   * const ready = await broker.until(AppReady)
   * ```
   */
  until<E extends EventClass>(
    eventClass: E,
    filter: Filter<E> = {},
  ): Promise<InstanceType<E>> {
    return new Promise((resolve, reject) => {
      const { aborted, off } = onAbort(reject, this.abortSignal)
      if (!aborted)
        this.once(eventClass, filter, (event) => {
          off()
          resolve(event)
        })
    })
  }

  /**
   * Registers a handler that streams values back for an {@link Invocation}. Many
   * brokers can register for the same invocation; a caller's
   * {@link PluginBroker.invoke} collects the values from all of them. The
   * invocation completes for this handler when the function returns (or its
   * promise settles).
   *
   * @returns a disposer that removes the handler.
   * @example
   * ```ts
   * broker.register(ListFiles, async (event, { send, signal }) => {
   *   for (const f of await readdir(event.dir, { signal })) send(f)
   * })
   * ```
   */
  register<E extends InvocationClass<unknown>>(
    eventClass: E,
    listener: InvocationListener<E>,
  ): () => void

  /** Registers a handler only for invocations matching `filter`. */
  register<E extends InvocationClass<unknown>>(
    eventClass: E,
    filter: Filter<E>,
    listener: InvocationListener<E>,
  ): () => void

  register<E extends InvocationClass<unknown>>(
    eventClass: E,
    filterOrListener: Filter<E> | InvocationListener<E>,
    listener?: InvocationListener<E>,
  ): () => void {
    return this.#addListener(
      this.#broker.invokeHandlers,
      this.#broker.bus.register,
      eventClass,
      filterOrListener,
      listener,
    )
  }

  /**
   * Intercepts events of `eventClass` before their listeners run. The listener
   * may return a replacement event, {@link CANCEL} to drop it, or nothing to
   * leave it unchanged (see {@link InterceptionResult}). Interceptors across
   * brokers form a chain, each seeing the previous one's result. Because an
   * {@link Invocation} is emitted before it is invoked, intercepting its class
   * transforms or cancels invocations too.
   *
   * @returns a disposer that removes the interceptor.
   */
  intercept<E extends EventClass>(
    eventClass: E,
    listener: InterceptionListener<E>,
  ): () => void

  /** Intercepts only events matching `filter`. */
  intercept<E extends EventClass>(
    eventClass: E,
    filter: Filter<E>,
    listener: InterceptionListener<E>,
  ): () => void

  intercept<E extends EventClass | InvocationClass<unknown>>(
    eventClass: E,
    filterOrListener: Filter<E> | InterceptionListener<E>,
    listener?: InterceptionListener<E>,
  ): () => void {
    return this.#addListener(
      this.#broker.interceptionHandlers,
      this.#broker.bus.intercept,
      eventClass,
      filterOrListener,
      listener,
    )
  }

  /**
   * Emits an invocation and streams back the values every registered handler
   * `send`s. Nothing runs until you consume the result, via either
   * `collect()` (a promise of all values) or `iterate()` (an async iterable that
   * yields them as they arrive). The stream completes once every handler across
   * every broker has settled.
   *
   * Errors are fail-loud by default: an unobserved handler error rejects the
   * stream. Pass `onError` to isolate handlers instead — errors are reported
   * there and the stream still completes with the healthy handlers' values. Pass
   * `signal` to cancel; the same signal is forwarded to handlers so they can
   * abort in-flight work.
   *
   * @example
   * ```ts
   * const files = await broker.invoke(new ListFiles('/tmp')).collect()
   *
   * for await (const file of broker.invoke(new ListFiles('/tmp')).iterate()) {
   *   console.log(file)
   * }
   * ```
   */
  invoke<E extends Invocation<unknown>>(
    event: E,
    {
      signal,
      onError = (error) => {
        throw error
      },
    }: {
      signal?: AbortSignal
      onError?: InvocationErrorHandler
    } = {},
  ): {
    collect(): Promise<InvocationType<E>[]>
    iterate(): AsyncIterable<InvocationType<E>, undefined>
  } {
    type T = InvocationType<E>

    const readableStream = new ReadableStream(
      new InvocationSource(this, event, this.#invoke, onError, signal),
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

  #addListener<E extends EventClass, F extends (...args: any) => any>(
    registry: Map<E, Set<Handler<InstanceType<E>>>>,
    subscribe: (broker: this, eventClass: E) => () => void,
    eventClass: E,
    filterOrEventListener: Filter<E> | F,
    eventListener?: F,
  ) {
    const filter = (eventListener ? filterOrEventListener : {}) as Filter<E>
    eventListener ??= filterOrEventListener as F

    const handlers = getOrInsert(registry, eventClass, new Set())
    const handler = new Handler(filter, eventListener)
    handlers.add(handler)

    const unregister = subscribe(this, eventClass)
    return () => {
      const handlers = registry.get(eventClass)
      handlers?.delete(handler)
      if (!handlers?.size) unregister()
    }
  }
}

class InvocationSource<
  E extends Invocation<unknown>,
> implements UnderlyingDefaultSource<InvocationType<E>> {
  readonly #producer = new AbortController()
  #settled = false
  #teardown = (_reason: any) => {}

  constructor(
    private readonly pluginBroker: PluginBroker,
    private readonly event: E,
    private readonly invoke: (
      event: E,
      params: InvocationListenerContext<InvocationClass>,
      reportError: InvocationErrorHandler,
    ) => Promise<void>,
    private readonly onError: InvocationErrorHandler,
    private readonly signal?: AbortSignal,
  ) {}

  start(controller: ReadableStreamDefaultController<InvocationType<E>>) {
    let aborted = false
    let offAbort = () => {}
    let offBrokerAbort = () => {}

    this.#teardown = (reason: any) => {
      if (this.#settled) return
      this.#settled = true
      offAbort()
      offBrokerAbort()
      this.#producer.abort(reason)
    }
    ;({ aborted, off: offBrokerAbort } = this.pluginBroker.onAbort(() =>
      this.#abort(controller),
    ))
    if (aborted) return
    ;({ aborted, off: offAbort } = onAbort(
      () => this.#close(controller),
      this.signal,
    ))
    if (aborted) return

    // Completion is the settling of #invoke's promise: it resolves once
    // every handler across every broker has returned, and rejects if one
    // of them threw.
    this.invoke(
      this.event,
      {
        send: (value: unknown) => {
          if (this.#settled) return
          controller.enqueue(value as InvocationType<E>)
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

  #close(controller: ReadableStreamDefaultController<InvocationType<E>>) {
    if (this.#settled) return
    this.#teardown(this.signal?.reason)
    controller.close()
  }

  #abort(
    controller: ReadableStreamDefaultController<InvocationType<E>>,
    reason = this.pluginBroker.abortSignal.reason,
  ) {
    if (this.#settled) return
    this.#teardown(reason)
    controller.error(reason)
  }
}
