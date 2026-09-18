import type { Message, MessageClass } from '../Message/Message.js'
import type { Filter, FilterEntries, FilterPredicate } from '../Filter.js'

export class Handler<M extends Message> {
  readonly #filterEntries: FilterEntries<MessageClass>
  readonly #callback: (message: M, ...args: unknown[]) => any

  constructor(
    filter: Filter<MessageClass>,
    callback: (message: M, ...args: unknown[]) => any,
  ) {
    this.#filterEntries = Object.entries(filter) as FilterEntries<MessageClass>
    this.#callback = callback
  }

  handle(message: M, ...args: unknown[]): any | void {
    if (this.#filter(message)) return this.#callback(message, ...args)
  }

  #filter(message: M) {
    return this.#filterEntries.every(([key, value]) =>
      typeof value === 'function'
        ? (value as FilterPredicate<MessageClass>)(message)
        : value === message[key],
    )
  }
}
