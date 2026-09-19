import type { Message } from './Message.ts'
import { defaultEncode, type Codec } from './Codec.ts'

/**
 * Like {@link message}, but defines a {@link CommandMessage} that streams `R`
 * values back from responders. `T` is the (serializable) payload; `R` is the
 * response value type surfaced through `gateway.invoke(...).collect()`.
 *
 * @example
 * ```ts
 * const ListFiles = command<{ dir: string }, string>('list-files')
 * const files = await gateway.invoke(new ListFiles({ dir: '/tmp' })).collect()
 * ```
 */
export function command<T extends object, R>(
  name: string,
  codec: Partial<Codec<CommandMessage<R> & T>> = {},
): CommandMessageClass<R, T> {
  class Generated extends CommandMessage<R> {
    static readonly $name = name
    static readonly $encode = codec.encode ?? defaultEncode
    static readonly $decode =
      codec.decode ?? ((payload: any) => new Generated(payload))

    readonly $name = name

    constructor(payload: T) {
      super()
      Object.assign(this, payload)
    }
  }

  return Generated as CommandMessageClass<R, T>
}

/**
 * A {@link Message} that also asks registered responders to stream values back.
 * Define one with {@link command}; send it with `gateway.invoke` and collect the
 * values that responders `send`. Because a command message is also a message, it
 * is first emitted (and can be intercepted) before it is invoked.
 *
 * @typeParam T - the type of each value responders stream back.
 */
export abstract class CommandMessage<T = unknown> implements Message {
  abstract $name: string
  /** Phantom field carrying `T` for inference; never assigned at runtime. */
  declare $responseType: T
}

/** The constructor type of a {@link CommandMessage}, as returned by {@link command}. */
export interface CommandMessageClass<R = unknown, T extends object = any> {
  new (payload: T): CommandMessage<R> & T
  readonly $name: string
  $encode(message: CommandMessage<R> & T): unknown
  $decode(payload: unknown): CommandMessage<R> & T
}

/**
 * Extracts the streamed value type `T` from a {@link CommandMessage} instance or
 * its class — e.g. `ResponseType<typeof ListFiles>` is `string`.
 */
export type ResponseType<
  E extends CommandMessage<any> | CommandMessageClass<any>,
> =
  E extends CommandMessage<infer V>
    ? V
    : E extends CommandMessageClass<infer V>
      ? V
      : never
