import type { Bus } from '../Bus.js'
import type {
  Event,
  EventClass,
  Invocation,
  InvocationClass,
} from '../Event.js'
import { withCounter } from '../lang/Function.js'
import { MethodQueue } from '../Queue/MethodQueue.js'
import type { EventHandler } from './EventHandler.js'
import type { InvocationHandler } from './InvocationHandler.js'

/**
 * The full broker. Only the Bus and internal machinery ever hold one; plugins
 * receive a PluginBroker facade instead. Owns the handler registries + queue,
 * and implements the *inbound* pipe: the bus delivering events/invocations
 * into this broker's local handlers. Note `emit`/`invoke`/`start`/`stop`/`abort`
 * here are the bus-driven direction — the identically named PluginBroker
 * methods are the opposite (plugin -> bus) direction, which is exactly why the
 * two can't collapse into one object.
 */
export class Broker {
  readonly eventHandlers = new Map<EventClass, Set<EventHandler>>()

  readonly invokeHandlers = new Map<
    InvocationClass<unknown>,
    Set<InvocationHandler>
  >()

  readonly queue = new MethodQueue()

  readonly emit: (event: Event) => void

  readonly #abortController = new AbortController()

  constructor(
    readonly bus: Bus,
    readonly name: string,
  ) {
    this.abortSignal.addEventListener('abort', () => {
      this.eventHandlers.clear()
      this.invokeHandlers.clear()
    })

    this.emit = this.queue.queueMethod((event: Event) => {
      for (const handler of this.eventHandlers.get(
        event.constructor as EventClass,
      ) ?? [])
        handler.handle(event)
    })
  }

  get abortSignal(): AbortSignal {
    return this.#abortController.signal
  }

  onAbort(fn: (reason: any) => any) {
    this.abortSignal.addEventListener('abort', fn)
    return () => this.abortSignal.removeEventListener('abort', fn)
  }

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

    for (const handler of invokeHandlers)
      handler.handle(event, { ...context, finish })
  }

  start() {
    this.queue.start()
  }

  stop() {
    this.queue.stop()
  }

  abort(reason?: unknown) {
    this.#abortController.abort(reason)
  }
}
