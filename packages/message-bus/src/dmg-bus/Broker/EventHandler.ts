import type { Event, EventClass } from '../Event.js'
import type { EventListener } from '../EventListener.js'
import type { Filter } from '../Filter.js'
import { Handler } from './Handler.js'

export class EventHandler extends Handler {
  readonly #listener: EventListener<EventClass>

  constructor(filter: Filter<EventClass>, listener: EventListener<EventClass>) {
    super(filter)
    this.#listener = listener
  }

  handle(event: Event) {
    if (this.filter(event)) this.#listener(event)
  }
}
