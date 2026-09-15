import type {
  Event,
  EventClass,
  Invocation,
  InvocationClass,
} from '../Event.js'
import { withCounter } from '../lang/Function.js'
import type { BrokerModel } from './BrokerModel.js'

export class BusBroker {
  readonly #model: BrokerModel

  readonly #abortController: AbortController

  readonly emit: (event: Event) => void

  constructor(model: BrokerModel, abortController: AbortController) {
    this.#abortController = abortController

    this.#model = model

    this.emit = model.queue.queueMethod((event: Event) => {
      for (const eventHandler of this.#model.eventHandlers.get(
        event.constructor as EventClass,
      ) ?? [])
        eventHandler.handle(event)
    })
  }

  get name() {
    return this.#model.name
  }

  invoke<T>(
    event: Invocation<T>,
    context: {
      finish: () => void
      send: (value: any) => void
      signal?: AbortSignal
    },
  ) {
    if (!this.#model.queue.running) return context.finish()

    const invokeHandlers = this.#model.invokeHandlers.get(
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
    this.#model.queue.start()
  }

  stop() {
    this.#model.queue.stop()
  }

  abort(reason?: any) {
    this.#abortController.abort(reason)
  }
}
