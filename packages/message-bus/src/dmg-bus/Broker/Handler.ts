import type { Event, EventClass } from '../Event.js'
import type { Filter, FilterEntries, FilterPredicate } from '../Filter.js'

export class Handler<E extends Event, R = void> {
  readonly #filterEntries: FilterEntries<EventClass>
  readonly #listener: (event: E, ...args: unknown[]) => R

  constructor(
    filter: Filter<EventClass>,
    listener: (event: E, ...args: unknown[]) => R,
  ) {
    this.#filterEntries = Object.entries(filter) as FilterEntries<EventClass>
    this.#listener = listener
  }

  handle(event: E, ...args: unknown[]): R | void {
    if (this.#filter(event)) return this.#listener(event, ...args)
  }

  #filter(event: E) {
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
