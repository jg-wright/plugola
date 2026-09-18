/**
 * The shape every message on the bus shares. Messages are plain class instances
 * — subscribers subscribe to a message's *class* (its constructor), and the bus
 * routes by that class identity, so two messages of the same class are delivered
 * to the same subscribers. `$name` is a human-readable label for logging and
 * debugging; it plays no part in routing.
 *
 * @example
 * ```ts
 * class UserLoggedIn implements Message {
 *   readonly $name = 'user-logged-in'
 *   constructor(readonly userId: string) {}
 * }
 * ```
 */
export interface Message {
  readonly $name: string
}

/**
 * The constructor type of a {@link Message}. This is what you pass to
 * `gateway.on`, `gateway.intercept`, etc. — the class itself, not an instance.
 */
export type MessageClass<M extends Message = Message> = abstract new (
  ...args: any[]
) => M
