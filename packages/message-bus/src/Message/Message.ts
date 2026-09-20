import { type Named } from './Named.ts'

/**
 * Defines a data {@link Message} factory from a payload type `T`, in one call.
 * Calling the returned factory builds a message — a plain object that _is_ its
 * payload `T` plus framework metadata. There is no `new` and no class: a message
 * is an interface, and its factory is the sole way to make one.
 *
 * The factory:
 *
 * - takes the whole payload as a single argument and spreads it onto the message
 *   (`Clicked({ x, y }).x`), so a message's fields _are_ `T`;
 * - carries its wire name as `Clicked.$name` and stamps it on every message it
 *   builds — a single source of truth for logging and for addressing on the wire;
 * - is the routing identity itself: `gateway.on(Clicked, …)` keys off the
 *   factory, and each message points back at it via `$factory`, so the bus routes
 *   by factory identity (as it once routed by class identity).
 *
 * The transport codec (`$encode`/`$decode`) is layered on separately, by a
 * Channel's `MessageRegistry` at registration time — see
 * {@link makeTransportable}. A factory used only in-process never carries one.
 *
 * This is EIP's *Message Translator* declared at the point of definition. A
 * factory is **final** identity — it is registered and routed as itself, so
 * wrapping or re-creating it would not cross a {@link MessagingBridge}.
 *
 * @example
 * ```ts
 * const Clicked = message<{ x: number; y: number }>('clicked')
 * const c = Clicked({ x: 1, y: 2 })
 * c.x // 1
 * c.$name // 'clicked'
 * ```
 */
export function message<T extends object>(name: string): MessageFactory<T> {
  return createFactory(name) as MessageFactory<T>
}

/**
 * The metadata every message on the bus shares, over and above its payload: a
 * message is its payload `T` spread onto a plain object, plus `$name` (a
 * human-readable label, and the key it is addressed by on the wire) and
 * `$factory` (the factory that built it, which the bus routes by). This type is
 * deliberately payload-agnostic — the payload rides along as `& T` on a
 * {@link MessageFactory}'s output — so `Message` stays free of the variance a
 * payload type parameter would impose. Messages are **not** constructed with
 * `new`; call a {@link MessageFactory}.
 */
export interface Message extends Named {
  /** The factory that built this message — the bus's routing identity. */
  readonly $factory: MessageFactory
}

/**
 * A message factory, as returned by {@link message}. Call it to build a message;
 * pass the factory itself to `gateway.on`, `gateway.intercept`, etc. — it, not an
 * instance, is the routing key, and a {@link MessagingBridge} reads `$name` (and,
 * once registered, `$encode`/`$decode`) from it.
 */
export interface MessageFactory<T extends object = any> extends Named {
  (payload: T): Message & T
}

/** The message a factory builds — its payload plus {@link Message} metadata. */
export type MessageOf<F> = F extends (...args: any) => infer M ? M : never

/**
 * Builds a factory that stamps each message with its `$name` and a `$factory`
 * back-reference. Shared by {@link message} and {@link command}: a command
 * factory is identical at runtime — what makes it a command is being registered
 * as one (see {@link MessageRegistry}), not any flag it carries.
 */
export function createFactory(name: string): MessageFactory {
  const factory = ((payload: object) => ({
    ...payload,
    $name: name,
    $factory: factory,
  })) as MessageFactory
  return Object.assign(factory, { $name: name })
}
