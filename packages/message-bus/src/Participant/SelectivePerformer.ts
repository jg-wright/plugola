import type { MessageFactory, MessageOf } from '../Message/Message.ts'
import type { Filter, FilterEntries, FilterPredicate } from '../Filter.ts'
import type { Performer } from '../Roles/Performer.ts'

/**
 * A performer (a {@link Subscriber}, {@link Responder}, or {@link Interceptor})
 * paired with the {@link Filter} that decides which messages it acts on — a
 * *Selective Consumer* in EIP terms. {@link SelectivePerformer.perform} runs the
 * callback only when the message matches the filter.
 */
export class SelectivePerformer<
  M extends MessageFactory,
  P extends Performer<M> = Performer<M>,
> {
  readonly #filterEntries: FilterEntries<M>
  readonly #performer: P

  constructor(filter: Filter<M>, performer: P) {
    this.#filterEntries = Object.entries(filter) as FilterEntries<M>
    this.#performer = performer
  }

  perform(...args: Parameters<P>): void | ReturnType<P> {
    // `#performer` is a type variable constrained to a union of roles with
    // differing arity and return types, so TS can't verify the spread call
    // generically. Each instance binds `P` to a single role, so casting to a
    // rest-parameter signature is sound.
    const call = this.#performer as (...args: Parameters<P>) => ReturnType<P>
    if (this.#filter(args[0])) return call(...args)
  }

  #filter(message: MessageOf<M>) {
    return this.#filterEntries.every(([key, value]) =>
      typeof value === 'function'
        ? (value as FilterPredicate<M>)(message)
        : value === message[key as keyof M],
    )
  }
}
