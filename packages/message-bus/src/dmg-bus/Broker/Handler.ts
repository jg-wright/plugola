import { Event, EventClass } from '../Event.js'
import { Filter, FilterEntries, FilterPredicate } from '../Filter.js'

export abstract class Handler {
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
