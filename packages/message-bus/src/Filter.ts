import type { MessageClass } from './Message/Message.ts'

/**
 * Narrows a subscription to only the messages you care about. A filter is a
 * partial map of a message's properties, where each value is either an expected
 * value (matched with `===`) or a predicate. **All** listed keys must match
 * (logical AND); an empty filter matches every message.
 *
 * This is EIP's *Message Filter* (whole-message pass-or-discard) — not the
 * similarly named *Content Filter*, which strips fields from within a message.
 * A {@link SelectivePerformer} carrying one is a *Selective Consumer*.
 *
 * @example
 * ```ts
 * // fires only when both hold
 * gateway.on(Order, { status: 'paid', total: (o) => o.total > 100 }, subscriber)
 * ```
 */
export type Filter<M extends MessageClass> = {
  [K in keyof InstanceType<M>]?: FilterValue<M, K>
}

/** A single `[key, value-or-predicate]` pair of a {@link Filter}. */
export type FilterEntry<M extends MessageClass> = {
  [K in keyof InstanceType<M>]: [K, FilterValue<M, K>]
}[keyof InstanceType<M>]

/** A {@link Filter} flattened to its `[key, value]` entries. */
export type FilterEntries<M extends MessageClass> = FilterEntry<M>[]

/** An accepted filter value for property `K`: the value itself, or a predicate. */
export type FilterValue<
  M extends MessageClass,
  K extends keyof InstanceType<M>,
> = InstanceType<M>[K] | FilterPredicate<M>

/** A predicate filter: gets the whole message, returns whether it matches. */
export interface FilterPredicate<M extends MessageClass> {
  (message: InstanceType<M>): boolean
}
