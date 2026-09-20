import type { Message, MessageFactory } from '../Message/Message.ts'
import type { Filter, FilterEntries, FilterPredicate } from '../Filter.ts'

/**
 * A performer (a {@link Subscriber}, {@link Responder}, or {@link Interceptor})
 * paired with the {@link Filter} that decides which messages it acts on — a
 * *Selective Consumer* in EIP terms. {@link SelectivePerformer.perform} runs the
 * callback only when the message matches the filter.
 */
export class SelectivePerformer<M extends Message> {
  readonly #filterEntries: FilterEntries<MessageFactory>
  readonly #performer: (message: M, ...args: unknown[]) => any

  constructor(
    filter: Filter<MessageFactory>,
    performer: (message: M, ...args: unknown[]) => any,
  ) {
    this.#filterEntries = Object.entries(
      filter,
    ) as FilterEntries<MessageFactory>
    this.#performer = performer
  }

  perform(message: M, ...args: unknown[]): any | void {
    if (this.#filter(message)) return this.#performer(message, ...args)
  }

  #filter(message: M) {
    return this.#filterEntries.every(([key, value]) =>
      typeof value === 'function'
        ? (value as FilterPredicate<MessageFactory>)(message)
        : value === message[key as keyof M],
    )
  }
}
