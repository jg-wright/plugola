import type {
  Event,
  EventClass,
  Invocation,
  InvocationClass,
  InvocationType,
} from '../Event.js'
import {
  CANCEL,
  EventListener,
  InterceptionListener,
  InvocationListener,
  InvocationListenerContext,
} from '../EventListener.js'
import type { Filter } from '../Filter.js'
import { getOrInsert } from '../lang/Map.js'
import type { Broker } from './Broker.js'
import { EventHandler } from './EventHandler.js'
import { InterceptionHandler } from './InterceptionHandler.js'
import { InvocationHandler } from './InvocationHandler.js'

export class PluginBroker {
  readonly #broker: Broker

  readonly #invoke: <E extends InvocationClass<unknown>>(
    event: InstanceType<E>,
    params: InvocationListenerContext<E>,
  ) => void

  readonly emit: <E extends Event>(event: E) => Promise<E | typeof CANCEL>

  get name() {
    return this.#broker.name
  }

  get abortSignal(): AbortSignal {
    return this.#broker.abortSignal
  }

  get aborted() {
    return this.abortSignal.aborted
  }

  get abortReason() {
    return this.abortSignal.reason
  }

  onAbort(fn: (reason: any) => any) {
    this.abortSignal.addEventListener('abort', fn)
    return () => this.abortSignal.removeEventListener('abort', fn)
  }

  constructor(broker: Broker) {
    this.#broker = broker

    this.#invoke = broker.queue.queueMethod(
      async (
        event: Invocation<unknown>,
        context: {
          send(value: any): void
          finish(): void
          signal?: AbortSignal
        },
      ) => {
        const result = await this.#broker.bus.emit(event)
        if (result === CANCEL) return
        this.#broker.bus.invoke(result, context)
      },
    )

    this.emit = broker.queue.queueMethod(<E extends Event>(event: E) =>
      this.#broker.bus.emit(event),
    )
  }

  start(name: string) {
    this.#broker.bus.start(name)
  }

  stop(name: string) {
    this.#broker.bus.stop(name)
  }

  abort(name: string, reason?: any) {
    this.#broker.bus.abort(name, reason)
  }

  on<E extends EventClass>(
    eventClass: E,
    eventListener: EventListener<E>,
  ): () => void

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
    const filter = (eventListener ? filterOrEventListener : {}) as Filter<E>
    eventListener ??= filterOrEventListener as EventListener<E>

    const eventHandlers = getOrInsert(
      this.#broker.eventHandlers,
      eventClass,
      new Set(),
    )
    const eventHandler = new EventHandler(filter, eventListener)
    eventHandlers.add(eventHandler)

    const unregister = this.#broker.bus.on(this, eventClass)
    return () => {
      const eventHandlers = this.#broker.eventHandlers.get(eventClass)
      eventHandlers?.delete(eventHandler)
      if (!eventHandlers?.size) unregister()
    }
  }

  once<E extends EventClass>(
    eventClass: E,
    eventListener: EventListener<E>,
  ): () => void

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

  until<E extends EventClass>(
    eventClass: E,
    filter: Filter<E> = {},
  ): Promise<InstanceType<E>> {
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(this.abortSignal.reason)
      if (this.abortSignal.aborted) return onAbort()
      this.abortSignal.addEventListener('abort', onAbort)
      this.once(eventClass, filter, (event) => {
        this.abortSignal.removeEventListener('abort', onAbort)
        resolve(event)
      })
    })
  }

  register<E extends InvocationClass<unknown>>(
    eventClass: E,
    listener: InvocationListener<E>,
  ): () => void

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
    const filter = (listener ? filterOrListener : {}) as Filter<E>
    listener ??= filterOrListener as InvocationListener<E>

    const handlers = getOrInsert(
      this.#broker.invokeHandlers,
      eventClass,
      new Set(),
    )
    const handler = new InvocationHandler(filter, listener)
    handlers.add(handler)

    const unregister = this.#broker.bus.register(this, eventClass)
    return () => {
      const handlers = this.#broker.invokeHandlers.get(eventClass)
      handlers?.delete(handler)
      if (!handlers?.size) unregister()
    }
  }

  intercept<E extends EventClass>(
    eventClass: E,
    listener: InterceptionListener<E>,
  ): () => void

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
    const filter = (listener ? filterOrListener : {}) as Filter<E>
    listener ??= filterOrListener as InterceptionListener<E>

    const handlers = getOrInsert(
      this.#broker.interceptionHandlers,
      eventClass,
      new Set(),
    )
    const handler = new InterceptionHandler(filter, listener)
    handlers.add(handler)

    const unregister = this.#broker.bus.intercept(this, eventClass)
    return () => {
      const handlers = this.#broker.interceptionHandlers.get(eventClass)
      handlers?.delete(handler)
      if (!handlers?.size) unregister()
    }
  }

  invoke<E extends Invocation<unknown>>(
    event: E,
    {
      signal,
    }: {
      signal?: AbortSignal
    } = {},
  ): {
    collect(): Promise<InvocationType<E>[]>
    iterate(): AsyncIterable<InvocationType<E>, undefined>
  } {
    type T = InvocationType<E>

    const self = this
    const producer = new AbortController()
    let settled = false
    let teardown = (_reason?: any) => {}

    const readableStream = new ReadableStream<T>({
      start: (controller) => {
        const offAbort = this.onAbort(abort)
        signal?.addEventListener('abort', close)

        teardown = (reason?: any) => {
          if (settled) return
          settled = true
          offAbort()
          signal?.removeEventListener('abort', close)
          producer.abort(reason)
        }

        if (this.aborted) return abort()
        if (signal?.aborted) return close()

        this.#invoke(event, {
          send: (value: unknown) => {
            if (settled) return
            controller.enqueue(value as T)
          },
          finish: close,
          signal: producer.signal,
        })

        function close() {
          if (settled) return
          teardown(signal?.reason)
          controller.close()
        }

        function abort() {
          if (settled) return
          teardown(self.abortReason)
          controller.error(self.abortReason)
        }
      },

      cancel: (reason) => teardown(reason),
    })

    return {
      async collect() {
        const items: T[] = []
        for await (const item of readableStream) items.push(item)
        return items
      },

      iterate: () => readableStream.values(),
    }
  }
}
