import type { Event, EventClass, InvocationClass } from '../Event.js'
import type {
  InterceptionListener,
  InterceptionResult,
} from '../EventListener.js'
import { Filter } from '../Filter.js'
import { Handler } from './Handler.js'

export class InterceptionHandler extends Handler {
  readonly #listener: InterceptionListener<
    EventClass | InvocationClass<unknown>
  >

  constructor(
    filter: Filter<EventClass>,
    listener: InterceptionListener<EventClass | InvocationClass<unknown>>,
  ) {
    super(filter)
    this.#listener = listener
  }

  handle(event: Event): InterceptionResult<EventClass> {
    if (this.filter(event)) return this.#listener(event as any)
  }
}
