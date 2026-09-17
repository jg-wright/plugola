import type { Bus } from '../Bus.js'
import type {
  Event,
  EventClass,
  Invocation,
  InvocationClass,
} from '../Event.js'
import { CANCEL, type InvocationListenerContext } from '../EventListener.js'
import { withCounter } from '../lang/Function.js'
import { MethodQueue } from '../Queue/MethodQueue.js'
import { Handler } from './Handler.js'
import { PluginBroker } from './PluginBroker.js'

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
  readonly eventHandlers = new Map<EventClass, Set<Handler<Event>>>()

  readonly invokeHandlers = new Map<InvocationClass, Set<Handler<Invocation>>>()

  readonly interceptionHandlers = new Map<EventClass, Set<Handler<Event>>>()

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

  async intercept<E extends EventClass | InvocationClass>(
    event: InstanceType<E>,
  ): Promise<InstanceType<E> | typeof CANCEL> {
    if (!this.queue.running) return event

    const interceptionHandlers = this.interceptionHandlers.get(
      event.constructor as EventClass,
    )

    if (!interceptionHandlers?.size) return event

    for (const interceptionHandler of interceptionHandlers) {
      const result = await interceptionHandler.handle(event)
      if (result === CANCEL) return CANCEL
      else if (result) event = result as InstanceType<E>
    }

    return event
  }

  invoke<T>(
    event: Invocation<T>,
    context: InvocationListenerContext<InvocationClass<T>>,
  ) {
    if (!this.queue.running) return context.finish()

    const invokeHandlers = this.invokeHandlers.get(
      event.constructor as InvocationClass<T>,
    )

    if (!invokeHandlers?.size) return context.finish()

    const handlerContext = {
      ...context,
      finish: withCounter((counter) => {
        if (counter >= invokeHandlers.size) context.finish()
      }),
    } as InvocationListenerContext<InvocationClass<T>>

    for (const handler of invokeHandlers) handler.handle(event, handlerContext)
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

  createPluginFacade() {
    return new PluginBroker(this)
  }
}
