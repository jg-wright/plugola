import { createFactory, type Message } from './Message.ts'
import { type Named } from './Named.ts'

/**
 * Like {@link message}, but defines a {@link CommandMessage} factory that streams
 * `R` values back from responders. `T` is the (serializable) payload; `R` is the
 * response value type surfaced through `gateway.invoke(...).collect()`.
 *
 * @example
 * ```ts
 * const ListFiles = command<{ dir: string }, string>('list-files')
 * const files = await gateway.invoke(ListFiles({ dir: '/tmp' })).collect()
 * ```
 */
export function command<T extends object, R>(
  name: string,
): CommandMessageFactory<R, T> {
  return createFactory(name) as unknown as CommandMessageFactory<R, T>
}

/**
 * A {@link Message} that also asks registered responders to stream values back.
 * Define one with {@link command}; send it with `gateway.invoke` and collect the
 * values that responders `send`. Because a command message is also a message, it
 * is first emitted (and can be intercepted) before it is invoked.
 *
 * @typeParam R - the type of each value responders stream back.
 */
export interface CommandMessage<R = unknown> extends Message {
  /** Phantom field carrying `R` for inference; never present at runtime. */
  readonly $responseType: R
}

/** The factory of a {@link CommandMessage}, as returned by {@link command}. */
export interface CommandMessageFactory<
  R = unknown,
  T extends object = any,
> extends Named {
  (payload: T): CommandMessage<R> & T
}

/**
 * Extracts the streamed value type `R` from a {@link CommandMessage} or its
 * {@link CommandMessageFactory} — e.g. `ResponseType<typeof ListFiles>` is
 * `string`.
 */
export type ResponseType<E extends CommandMessage | CommandMessageFactory> =
  E extends CommandMessage<infer V>
    ? V
    : E extends (...args: any) => CommandMessage<infer V>
      ? V
      : never
