/**
 * The shape every message on the bus shares. Messages are plain class instances
 * — listeners subscribe to an event's *class* (its constructor), and the bus
 * routes by that class identity, so two events of the same class are delivered
 * to the same listeners. `$name` is a human-readable label for logging and
 * debugging; it plays no part in routing.
 *
 * @example
 * ```ts
 * class UserLoggedIn implements Event {
 *   readonly $name = 'user-logged-in'
 *   constructor(readonly userId: string) {}
 * }
 * ```
 */
export interface Event {
  readonly $name: string
}

/**
 * The constructor type of an {@link Event}. This is what you pass to
 * `broker.on`, `broker.intercept`, etc. — the class itself, not an instance.
 */
export type EventClass<E extends Event = Event> = abstract new (
  ...args: any[]
) => E

/**
 * An {@link Event} that also asks registered handlers to stream values back.
 * Subclass it and fix the value type through `T`; emit it with `broker.invoke`
 * and collect the `T`s that handlers `send`. Because an invocation is also an
 * event, it is first emitted (and can be intercepted) before it is invoked.
 *
 * @typeParam T - the type of each value handlers stream back.
 *
 * @example
 * ```ts
 * class ListFiles extends Invocation<string> {
 *   readonly $name = 'list-files'
 *   constructor(readonly dir: string) { super() }
 * }
 * ```
 */
export abstract class Invocation<T = unknown> implements Event {
  abstract $name: string
  /** Phantom field carrying `T` for inference; never assigned at runtime. */
  declare $invocationType: T
}

/** The constructor type of an {@link Invocation}. */
export type InvocationClass<T = unknown> = abstract new (
  ...args: any
) => Invocation<T>

/**
 * Extracts the streamed value type `T` from an {@link Invocation} instance or
 * its class — e.g. `InvocationType<typeof ListFiles>` is `string`.
 */
export type InvocationType<E extends Invocation<any> | InvocationClass<any>> =
  E extends Invocation<infer V>
    ? V
    : E extends InvocationClass<infer V>
      ? V
      : never
