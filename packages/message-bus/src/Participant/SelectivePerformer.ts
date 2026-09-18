import type { Message, MessageClass } from '../Message/Message.js'
import type { Filter, FilterEntries, FilterPredicate } from '../Filter.js'

/**
 * A performer (a {@link Subscriber}, {@link Responder}, or {@link Interceptor})
 * paired with the {@link Filter} that decides which messages it acts on — a
 * *Selective Consumer* in EIP terms. {@link SelectivePerformer.perform} runs the
 * callback only when the message matches the filter.
 */
export class SelectivePerformer<M extends Message> {
  readonly #filterEntries: FilterEntries<MessageClass>
  readonly #performer: (message: M, ...args: unknown[]) => any

  constructor(
    filter: Filter<MessageClass>,
    performer: (message: M, ...args: unknown[]) => any,
  ) {
    this.#filterEntries = Object.entries(filter) as FilterEntries<MessageClass>
    this.#performer = performer
  }

  perform(message: M, ...args: unknown[]): any | void {
    if (this.#filter(message)) return this.#performer(message, ...args)
  }

  #filter(message: M) {
    return this.#filterEntries.every(([key, value]) =>
      typeof value === 'function'
        ? (value as FilterPredicate<MessageClass>)(message)
        : value === message[key],
    )
  }
}
