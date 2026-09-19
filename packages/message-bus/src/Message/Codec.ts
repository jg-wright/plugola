/**
 * How a message instance is turned into a JSON-safe payload and back. Carried on a
 * generated class as `$encode`/`$decode` statics; both default from the
 * constructor shape (see {@link message} / {@link command}), so you only supply
 * one for custom marshalling.
 */
export interface Codec<M> {
  /** Instance → JSON-safe payload placed on the wire. */
  encode(message: M): unknown
  /** Payload from the wire → a fresh instance. */
  decode(payload: any): M
}

/** The default encoder: the instance's own, enumerable, non-`$` fields — i.e. its payload. */
export function defaultEncode(message: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(message).filter(([key]) => !key.startsWith('$')),
  )
}
