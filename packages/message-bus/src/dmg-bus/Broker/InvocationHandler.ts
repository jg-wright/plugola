import { EventClass, Invocation, InvocationClass } from '../Event.js'
import { InvocationListener } from '../EventListener.js'
import { Filter } from '../Filter.js'
import { Handler } from './Handler.js'

export class InvocationHandler extends Handler {
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
