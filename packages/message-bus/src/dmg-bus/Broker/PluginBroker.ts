import type {
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
import type { Filter } from '../Filter.js'
import { getOrInsert } from '../lang/Map.js'
import type { BrokerModel } from './BrokerModel.js'
import { EventHandler } from './EventHandler.js'
import { InvocationHandler } from './InvocationHandler.js'

export class PluginBroker {
  readonly #model: BrokerModel

  readonly #invoke: <E extends InvocationClass<unknown>>(
    event: InstanceType<E>,
    params: InvocationListenerContext<E>,
  ) => void

  readonly emit: (event: Event) => void

  get name() {
    return this.#model.name
  }

  constructor(
    model: BrokerModel,
    readonly abortSignal: AbortSignal,
  ) {
    this.#model = model

    this.#invoke = model.queue.queueMethod(
      (
        event: Invocation<unknown>,
        context: {
          send(value: any): void
          finish(): void
          signal?: AbortSignal
        },
      ) => {
        this.#model.bus.emit(event)
        this.#model.bus.invoke(event, context)
      },
    )

    this.emit = model.queue.queueMethod((event: Event) => {
      this.#model.bus.emit(event)
    })
  }

  start(name: string) {
    this.#model.bus.start(name)
  }

  stop(name: string) {
    this.#model.bus.stop(name)
  }

  abort(name: string, reason?: any) {
    this.#model.bus.abort(name, reason)
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
      this.#model.eventHandlers,
      eventClass,
      new Set(),
    )
    const eventHandler = new EventHandler(filter, eventListener)
    eventHandlers.add(eventHandler)

    const unregister = this.#model.bus.on(this, eventClass)
    return () => {
      const eventHandlers = this.#model.eventHandlers.get(eventClass)
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
      this.#model.invokeHandlers,
      eventClass,
      new Set(),
    )
    const handler = new InvocationHandler(filter, listener)
    handlers.add(handler)

    const unregister = this.#model.bus.register(this, eventClass)
    return () => {
      const handlers = this.#model.invokeHandlers.get(eventClass)
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
        const abort = () => controller.error(this.abortSignal.reason)
        const close = () => controller.close()

        if (this.abortSignal.aborted) return abort()
        if (signal?.aborted) return close()

        this.abortSignal.addEventListener('abort', abort)
        signal?.addEventListener('abort', close)

        this.#invoke(event, {
          send: (value: unknown) => controller.enqueue(value as T),
          finish: () => {
            this.abortSignal.removeEventListener('abort', abort)
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
