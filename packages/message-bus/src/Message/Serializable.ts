/**
 * A compile-time guard that a message payload is JSON-safe — no functions, no
 * class instances (DOM nodes, `Date`, `Map`, `Set`, …), no symbols or bigints:
 * only strings, numbers, booleans, `null`, and arrays/plain objects of those.
 *
 * Messages can sit in a participant's queue while it is paused and are delivered
 * later ({@link MethodQueue}). A payload that holds a live reference — an
 * `HTMLElement`, say — is therefore no longer a faithful snapshot by the time a
 * subscriber sees it: the node may have been detached or mutated, and the queue
 * pins it alive in the meantime. Constraining payloads to JSON-safe data means a
 * subscriber receives what was emitted, whenever it is emitted.
 *
 * This is a *type-level* rule only; nothing is validated or cloned at runtime.
 * Because the bus routes by class identity, the message's own class wrapper is
 * not serialized — so keys prefixed with `$` (the framework's metadata
 * convention, e.g. {@link Message.$name} and {@link CommandMessage.$responseType})
 * are exempt from the check. It is the payload fields that must be serializable.
 *
 * Applied to `emit`/`invoke` arguments, a non-serializable field surfaces as a
 * type error at the call site pointing at the offending field.
 *
 * @example
 * ```ts
 * class Clicked implements Message {
 *   readonly $name = 'clicked'
 *   constructor(readonly el: HTMLElement) {} // ⛔ emit(new Clicked(...)) errors
 * }
 * ```
 */
export type Serializable<T> = [T] extends [JsonPrimitive | undefined]
  ? T
  : [T] extends [(...args: never[]) => unknown]
    ? NotSerializable<'a function will not survive queuing'>
    : [T] extends [readonly unknown[]]
      ? { [I in keyof T]: Serializable<T[I]> }
      : [T] extends [object]
        ? { [K in keyof T]: K extends `$${string}` ? T[K] : Serializable<T[K]> }
        : NotSerializable<'value is not JSON-serializable'>

/** The primitive leaves JSON can represent. */
export type JsonPrimitive = string | number | boolean | null

/**
 * An unsatisfiable type whose key carries the reason into the compiler error, so
 * a rejected field reports *why* rather than a bare `never`.
 */
type NotSerializable<Why extends string> = { [K in Why]: never }
