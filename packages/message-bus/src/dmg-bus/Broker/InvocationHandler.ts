import type { EventClass, Invocation, InvocationClass } from '../Event.js'
import type {
  InvocationListener,
  InvocationListenerContext,
} from '../EventListener.js'
import type { Filter } from '../Filter.js'
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
    context: InvocationListenerContext<InvocationClass<unknown>>,
  ) {
    if (this.filter(event)) this.#listener(event, context)
  }
}
