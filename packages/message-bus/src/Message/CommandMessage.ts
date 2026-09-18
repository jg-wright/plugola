import type { Message } from './Message.js'

/**
 * A {@link Message} that also asks registered responders to stream values back.
 * Subclass it and fix the value type through `T`; send it with `gateway.invoke`
 * and collect the `T`s that responders `send`. Because a command message is also
 * a message, it is first emitted (and can be intercepted) before it is invoked.
 *
 * @typeParam T - the type of each value responders stream back.
 *
 * @example
 * ```ts
 * class ListFiles extends CommandMessage<string> {
 *   readonly $name = 'list-files'
 *   constructor(readonly dir: string) { super() }
 * }
 * ```
 */
export abstract class CommandMessage<T = unknown> implements Message {
  abstract $name: string
  /** Phantom field carrying `T` for inference; never assigned at runtime. */
  declare $responseType: T
}

/** The constructor type of a {@link CommandMessage}. */
export type CommandMessageClass<T = unknown> = abstract new (
  ...args: any
) => CommandMessage<T>

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
