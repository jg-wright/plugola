import type { EventClass } from './Event.js'

/**
 * Narrows a subscription to only the events you care about. A filter is a
 * partial map of an event's properties, where each value is either an expected
 * value (matched with `===`) or a predicate. **All** listed keys must match
 * (logical AND); an empty filter matches every event.
 *
 * @example
 * ```ts
 * // fires only when both hold
 * broker.on(Order, { status: 'paid', total: (o) => o.total > 100 }, listener)
 * ```
 */
export type Filter<E extends EventClass> = {
  [K in keyof InstanceType<E>]?: FilterValue<E, K>
}

/** A single `[key, value-or-predicate]` pair of a {@link Filter}. */
export type FilterEntry<E extends EventClass> = {
  [K in keyof InstanceType<E>]: [K, FilterValue<E, K>]
}[keyof InstanceType<E>]

/** A {@link Filter} flattened to its `[key, value]` entries. */
export type FilterEntries<E extends EventClass> = FilterEntry<E>[]

/** An accepted filter value for property `K`: the value itself, or a predicate. */
export type FilterValue<
  E extends EventClass,
  K extends keyof InstanceType<E>,
> = InstanceType<E>[K] | FilterPredicate<E>

/** A predicate filter: gets the whole event, returns whether it matches. */
export interface FilterPredicate<E extends EventClass> {
  (event: InstanceType<E>): boolean
}
