import { Bus } from './Bus.js'
import { DiscriminatedQueue } from './DiscriminatedQueue.js'
import { Invocation, InvocationClass, Event, EventClass } from './Event.js'
import { InvocationListener, EventListener } from './EventListener.js'
import { Filter, FilterEntries, FilterPredicate } from './Filter.js'
import { withCounter } from './Function.js'
import { PluginBroker } from './PluginBroker.js'
import { queueMethod } from './queuedMethods.js'

abstract class Handler {
  readonly #filterEntries: FilterEntries<EventClass>

  constructor(filter: Filter<EventClass>) {
    this.#filterEntries = Object.entries(filter) as FilterEntries<EventClass>
  }

  protected filter(event: Event) {
    return (
      !this.#filterEntries.length ||
      this.#filterEntries.some(([key, value]) =>
        typeof value === 'function'
          ? (value as FilterPredicate<EventClass>)(event)
          : value === event[key],
      )
    )
  }
}

class EventHandler extends Handler {
  readonly #listener: EventListener<EventClass>

  constructor(filter: Filter<EventClass>, listener: EventListener<EventClass>) {
    super(filter)
    this.#listener = listener
  }

  handle(event: Event) {
    if (this.filter(event)) this.#listener(event)
  }
}

class InvocationHandler extends Handler {
  readonly #listener: InvocationListener<InvocationClass<unknown>>

  constructor(
    filter: Filter<EventClass>,
    listener: InvocationListener<InvocationClass<unknown>>,
  ) {
    super(filter)
    this.#listener = listener
  }

  handle(
    event: Invocation<unknown>,
    context: {
      send: (value: unknown) => void
      finish: () => void
      signal?: AbortSignal
    },
  ) {
    if (this.filter(event)) this.#listener(event, context)
  }
}

export class Broker implements ListenableBroker {
  readonly eventHandlers = new Map<EventClass, Set<EventHandler>>()

  readonly invokeHandlers = new Map<
    InvocationClass<unknown>,
    Set<InvocationHandler>
  >()

  readonly queue = new DiscriminatedQueue({})

  constructor(
    public readonly bus: Bus,
    public readonly name: string,
    public readonly abortSignal: AbortSignal,
  ) {
    abortSignal.addEventListener('abort', () => {
      this.eventHandlers.clear()
      this.invokeHandlers.clear()
    })
  }

  emit = queueMethod(this.queue, (event: Event) => {
    for (const eventHandler of this.eventHandlers.get(
      event.constructor as EventClass,
    ) ?? [])
      eventHandler.handle(event)
  })

  invoke<T>(
    event: Invocation<T>,
    context: {
      finish: () => void
      send: (value: any) => void
      signal?: AbortSignal
    },
  ) {
    if (!this.queue.running) return context.finish()

    const invokeHandlers = this.invokeHandlers.get(
      event.constructor as InvocationClass<T>,
    )

    if (!invokeHandlers?.size) return context.finish()

    const finish = withCounter((counter) => {
      if (counter >= invokeHandlers.size) context.finish()
    })

    for (const invokeHandler of invokeHandlers)
      invokeHandler.handle(event, { ...context, finish })
  }

  start() {
    this.queue.start()
  }

  stop() {
    this.queue.stop()
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
    const eventHandlers = this.eventHandlers.getOrInsert(eventClass, new Set())
    const eventHandler = new EventHandler(filter, eventListener)
    eventHandlers.add(eventHandler)
    const unregister = this.bus.on(this, eventClass)
    return () => {
      const eventHandlers = this.eventHandlers.get(eventClass)
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
    const handlers = this.invokeHandlers.getOrInsert(eventClass, new Set())
    const handler = new InvocationHandler(filter, listener)
    handlers.add(handler)
    const unregister = this.bus.register(this, eventClass)
    return () => {
      const handlers = this.invokeHandlers.get(eventClass)
      handlers?.delete(handler)
      if (!handlers?.size) unregister()
    }
  }

  pluginBroker() {
    return new PluginBroker(this)
  }
}

export interface ListenableBroker {
  on<E extends EventClass>(
    eventClass: E,
    eventListener: EventListener<E>,
  ): () => void

  on<E extends EventClass>(
    eventClass: E,
    filter: Filter<E>,
    eventListener: EventListener<E>,
  ): () => void

  once<E extends EventClass>(
    eventClass: E,
    eventListener: EventListener<E>,
  ): () => void

  once<E extends EventClass>(
    eventClass: E,
    filter: Filter<E>,
    eventListener: EventListener<E>,
  ): () => void

  until<E extends EventClass>(
    eventClass: E,
    filter?: Filter<E>,
  ): Promise<InstanceType<E>>

  register<E extends InvocationClass<unknown>>(
    eventClass: E,
    listener: InvocationListener<E>,
  ): () => void

  register<E extends InvocationClass<unknown>>(
    eventClass: E,
    filter: Filter<E>,
    listener: InvocationListener<E>,
  ): () => void
}
