/**
 * A {@link Matcher} stands in for a literal argument in a filter prefix. When
 * one sits in a registered argument position, the bus runs its match method
 * against the emitted value instead of comparing for strict equality.
 *
 * The contract is a single symbol-keyed method, so anything — a plain object, a
 * class instance, a larger value that wants to double as a matcher — becomes a
 * matcher simply by implementing it.
 *
 * `T` is contravariant (it only appears in the match parameter), so a narrow
 * matcher such as `Matcher<{ bar: number }>` is accepted wherever a wider
 * object that structurally includes it is expected.
 */
export const MatcherSymbol = Symbol.for('@plugola/message-bus matcher')

export interface Matcher<in T = unknown> {
  [MatcherSymbol](value: T): boolean
}

export function isMatcher(value: unknown): value is Matcher {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<Matcher>)[MatcherSymbol] === 'function'
  )
}

/**
 * Compare a registered filter argument against an emitted value: run the
 * predicate if it's a {@link Matcher}, otherwise compare for strict equality.
 */
export function match(matcher: unknown, value: unknown): boolean {
  return isMatcher(matcher) ? matcher[MatcherSymbol](value) : matcher === value
}

/**
 * Widen a filter-prefix tuple so a {@link Matcher} is accepted in place of any
 * literal argument.
 *
 * @example
 * type A = Matchable<[string, { bar: number }]>
 * // [string | Matcher<string>, { bar: number } | Matcher<{ bar: number }>]
 */
export type Matchable<A extends unknown[]> = {
  [K in keyof A]: A[K] | Matcher<A[K]>
}

/**
 * Match an argument against any boolean test.
 *
 * @example
 * broker.on('foo', predicate((n: number) => n > 2), () => {})
 */
export function predicate<T>(match: (value: T) => boolean): Matcher<T> {
  return { [MatcherSymbol]: match }
}

/**
 * Match an object argument that deeply contains the given subset. Nested
 * objects are compared recursively as partials; every other value is compared
 * with strict equality.
 *
 * @example
 * broker.on('foo', objectWith({ bar: 2 }), () => {})
 * // fires for emit('foo', { bar: 2, baz: 9 })
 */
export function objectWith<S extends object>(subset: S): Matcher<S> {
  return { [MatcherSymbol]: (value) => objectContains(value, subset) }
}

function objectContains(value: unknown, subset: object): boolean {
  if (typeof value !== 'object' || value === null) return false

  for (const key of Reflect.ownKeys(subset)) {
    const expected = (subset as Record<PropertyKey, unknown>)[key]
    const actual = (value as Record<PropertyKey, unknown>)[key]

    if (expected !== null && typeof expected === 'object') {
      if (!objectContains(actual, expected)) return false
    } else if (actual !== expected) {
      return false
    }
  }

  return true
}
