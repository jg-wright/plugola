import { type Codec } from './Codec.ts'
import { type Named, NamedMixin } from './Named.ts'

/**
 * Defines a data {@link Message} class from a payload type `T`, in one call. The
 * returned class:
 *
 * - takes its whole payload as a single constructor argument and spreads it onto
 *   the instance (`new Clicked({ x, y }).x`), so its fields _are_ `T`;
 * - carries its wire name as both a static (`Clicked.$name`) and an instance
 *   property, a single source of truth that replaces the hand-written
 *   `readonly $name = '…'`;
 * - carries its own {@link Codec} as `$encode`/`$decode` statics, so a
 *   {@link MessagingBridge} can serialise an instance without a lookup and
 *   deserialise a payload once it has resolved the name to the class.
 *
 * Because the factory owns the constructor shape, the codec is optional: the
 * default `encode` keeps the payload fields (everything not `$`-prefixed) and the
 * default `decode` is `new Class(payload)`. Pass a codec only for non-trivial
 * marshalling (reshaping or versioning the wire form, say).
 *
 * The constructor accepts the payload as-is; serializability is enforced where it
 * matters — at `gateway.emit`/`invoke` — not at construction.
 *
 * This is EIP's *Message Translator* declared at the point of definition. The
 * class is **final** — it is registered and routed by its own identity, so
 * subclassing it would not cross a {@link MessagingBridge}.
 *
 * @example
 * ```ts
 * const Clicked = message<{ x: number; y: number }>('clicked')
 * const c = new Clicked({ x: 1, y: 2 })
 * c.x // 1
 * c.$name // 'clicked'
 * ```
 */
export function message<T extends object>(name: string): MessageClass<T> {
  class Generated extends NamedMixin(Message<T>, name) {}

  return Generated as MessageClass<T>
}

/**
 * The shape every message on the bus shares. Messages are class instances —
 * subscribers subscribe to a message's *class* (its constructor), and the bus
 * routes by that class identity, so two messages of the same class are delivered
 * to the same subscribers. `$name` is a human-readable label for logging, and the
 * key a message is addressed by on the wire when bridging.
 */
export abstract class Message<T extends object = any> implements Named {
  abstract $name: string
  constructor(payload: T) {
    Object.assign(this, payload)
  }
}

/**
 * The constructor type of a {@link Message}, as returned by {@link message}. This
 * is what you pass to `gateway.on`, `gateway.intercept`, etc. — the class itself,
 * not an instance — and what a {@link MessagingBridge} reads `$name`/`$encode`/
 * `$decode` from.
 */
export interface MessageClass<T extends object = any> extends Named {
  new (payload: T): Message & T
}
