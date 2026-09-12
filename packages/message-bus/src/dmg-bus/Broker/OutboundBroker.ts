import {
  Event,
  EventClass,
  Invocation,
  InvocationClass,
  InvocationType,
} from '../Event.js'
import {
  EventListener,
  InvocationListener,
  InvocationListenerContext,
} from '../EventListener.js'
import { Filter } from '../Filter.js'
import { queueMethod } from '../queuedMethods.js'
import { Broker } from './Broker.js'
import { EventHandler } from './EventHandler.js'
import { InvocationHandler } from './InvocationHandler.js'

export class OutboundBroker {
  readonly #broker: Broker

  readonly #invoke: <E extends InvocationClass<unknown>>(
    event: InstanceType<E>,
    params: InvocationListenerContext<E>,
  ) => void

  readonly emit: (event: Event) => void

  constructor(broker: Broker) {
    this.#broker = broker

    this.#invoke = queueMethod(
      broker.queue,
      (
        event: Invocation<unknown>,
        context: {
          send(value: any): void
          finish(): void
          signal?: AbortSignal
        },
      ) => {
        this.#broker.bus.emit(event)
        this.#broker.bus.invoke(event, context)
      },
    )

    this.emit = queueMethod(broker.queue, (event: Event) => {
      this.#broker.bus.emit(event)
    })
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
    const eventHandlers = this.#broker.eventHandlers.getOrInsert(
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
      const onAbort = () => reject(this.#broker.abortSignal.reason)
      if (this.#broker.abortSignal.aborted) return onAbort()
      this.#broker.abortSignal.addEventListener('abort', onAbort)
      this.once(eventClass, filter, (event) => {
        this.#broker.abortSignal.removeEventListener('abort', onAbort)
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
    const handlers = this.#broker.invokeHandlers.getOrInsert(
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
    promise(): Promise<void>
  } {
    type T = InvocationType<E>

    const readableStream = new ReadableStream<T>({
      start: (controller) => {
        const abort = () => controller.error(this.#broker.abortSignal.reason)
        const close = () => controller.close()

        if (this.#broker.abortSignal.aborted) return abort()
        if (signal?.aborted) return close()

        this.#broker.abortSignal.addEventListener('abort', abort)
        signal?.addEventListener('abort', close)

        this.#invoke(event, {
          send: (value: T) => controller.enqueue(value),
          finish: () => {
            this.#broker.abortSignal.removeEventListener('abort', abort)
            signal?.removeEventListener('abort', close)
            controller.close()
          },
          signal,
        })
      },
    })

    return {
      async collect() {
        const items: T[] = []
        for await (const item of readableStream) items.push(item)
        return items
      },

      iterate: () => readableStream.values(),

      promise: async (concurrency = 10) => {
        const reader = readableStream.getReader()
        let item = await reader.read()
        for (let i = 0; i < concurrency && !item.done; i++) {
          while ((item = await reader.read()) && !item.done) {}
        }
      },
    }
  }
}
