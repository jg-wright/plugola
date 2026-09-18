import type { Bus } from '../Bus.js'
import type {
  Event,
  EventClass,
  Invocation,
  InvocationClass,
} from '../Event.js'
import {
  CANCEL,
  type InvocationErrorHandler,
  type InvocationListenerContext,
} from '../EventListener.js'
import { onAbort } from '../lang/AbortSignal.js'
import { MethodQueue } from '../Queue/MethodQueue.js'
import { Handler } from './Handler.js'
import { PluginBroker } from './PluginBroker.js'

/**
 * The full broker. Only the Bus and internal machinery ever hold one; plugins
 * receive a PluginBroker facade instead. Owns the handler registries + queue,
 * and implements the *inbound* pipe: the bus delivering events/invocations
 * into this broker's local handlers. Note `emit`/`invoke`/`pause`/`resume`/`abort`
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

  readonly abortSignal: AbortSignal

  constructor(
    readonly bus: Bus,
    readonly name: string,
    abortSignal?: AbortSignal,
  ) {
    this.abortSignal = abortSignal
      ? AbortSignal.any([abortSignal, this.#abortController.signal])
      : this.#abortController.signal

    this.onAbort(() => {
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

  onAbort(fn: (reason: any) => any) {
    return onAbort(fn, this.abortSignal)
  }

  get aborted() {
    return this.abortSignal.aborted
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

  /**
   * Runs every local handler for the invocation and resolves once they have all
   * settled. Completion is derived from the handlers' own return values: a
   * filtered-out handler resolves immediately (its `handle` returns `undefined`),
   * so there's no count to keep in sync and nothing to hang on. The handler set
   * is snapshotted, so (un)registering during an in-flight invocation can't move
   * the target. Handlers are isolated: one that throws is routed to
   * `reportError` and neither stops its siblings nor prevents completion.
   */
  async invoke<T>(
    event: Invocation<T>,
    context: InvocationListenerContext<InvocationClass<T>>,
    reportError: InvocationErrorHandler,
  ): Promise<void> {
    if (!this.queue.running) return

    const invokeHandlers = this.invokeHandlers.get(
      event.constructor as InvocationClass<T>,
    )

    if (!invokeHandlers?.size) return

    await Promise.all(
      Array.from(invokeHandlers, async (handler) => {
        try {
          await handler.handle(event, context)
        } catch (error) {
          reportError(error)
        }
      }),
    )
  }

  resume() {
    this.queue.start()
  }

  pause() {
    this.queue.stop()
  }

  abort(reason?: unknown) {
    this.#abortController.abort(reason)
  }

  createPluginFacade() {
    return new PluginBroker(this)
  }
}
