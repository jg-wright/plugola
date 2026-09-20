import { type Codec, defaultEncode } from './Codec.ts'
import type { MessageFactory, MessageOf } from './Message.ts'

/**
 * Layers a transport {@link Codec} onto a message factory — the `$encode` /
 * `$decode` a {@link MessagingBridge} uses to put a message on the wire and
 * rebuild it on the far side. It mutates and returns the same factory (identity
 * is unchanged), so registering a factory is what makes it transportable. The
 * default `encode` keeps the payload (non-`$` fields) and the default `decode`
 * rebuilds the message by calling the factory.
 */
export function makeTransportable<F extends MessageFactory>(
  factory: F,
  codec?: Partial<Codec<MessageOf<F>>>,
): F & Transportable<MessageOf<F>> {
  const transportable = factory as F & Transportable<MessageOf<F>>
  transportable.$encode = codec?.encode ?? defaultEncode
  transportable.$decode = codec?.decode ?? ((payload: any) => factory(payload))
  return transportable
}

export interface Transportable<T> {
  $encode(message: T): unknown
  $decode(payload: unknown): T
}
