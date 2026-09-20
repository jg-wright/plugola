import {
  message,
  type Message,
  type MessageFactory,
} from '../Message/Message.ts'
import {
  command,
  type CommandMessage,
  type CommandMessageFactory,
} from '../Message/CommandMessage.ts'
import type { Codec } from '../Message/Codec.ts'
import {
  makeTransportable,
  type Transportable,
} from '../Message/Transportable.ts'

/**
 * The set of message factories that cross a {@link MessagingBridge}, and the
 * contract two buses share to name them. Because a factory identity cannot cross
 * a runtime boundary, the registry maps each `$name` to its factory so an inbound
 * frame can be resolved back to a factory and decoded.
 *
 * Defining a message _is_ registering it: {@link MessageRegistry.registerMessage}
 * and {@link MessageRegistry.registerCommand} create the factory (via
 * {@link message} / {@link command}) and record it in one act, so a bridged
 * message can't be forgotten. The registry doubles as the bridge's forward set —
 * every factory it holds is one the bridge subscribes to and relays.
 *
 * Both ends of a bridge build an equivalent registry from a shared module; the
 * factories are distinct objects per runtime (identity routes locally, names
 * cross the wire).
 *
 * @example
 * ```ts
 * export const registry = new MessageRegistry()
 * export const UserLoggedIn = registry.registerMessage<{ userId: string }>('user-logged-in')
 * export const Ping = registry.registerCommand<{}, 'pong'>('ping')
 * ```
 */
export class MessageRegistry {
  readonly #messages = new Map<
    string,
    MessageFactory<any> & Transportable<any>
  >()

  readonly #commands = new Map<
    string,
    CommandMessageFactory<any, any> & Transportable<any>
  >()

  /**
   * Defines a data {@link Message} factory under `name` and registers it, in one
   * act. Throws if `name` is already registered (as either a message or command).
   *
   * @returns the created factory — call it to build messages, and `emit`/`on`
   * with it as usual.
   */
  registerMessage<T extends object>(
    name: string,
    codec?: Partial<Codec<Message & T>>,
  ): MessageFactory<T> & Transportable<T> {
    this.#assertUnused(name)
    const factory = makeTransportable(message<T>(name), codec)
    this.#messages.set(name, factory)
    return factory
  }

  /**
   * Defines a {@link CommandMessage} factory under `name` and registers it, in
   * one act. Throws if `name` is already registered (as either a message or
   * command).
   *
   * @returns the created factory — call it to build commands, and
   * `invoke`/`register` responders with it as usual.
   */
  registerCommand<T extends object, R>(
    name: string,
    codec?: Partial<Codec<CommandMessage<R> & T>>,
  ): CommandMessageFactory<R, T> & Transportable<CommandMessage<R> & T> {
    this.#assertUnused(name)
    const factory = makeTransportable(command<T, R>(name), codec)
    this.#commands.set(name, factory)
    return factory
  }

  /**
   * The factory registered under `name` — message or command — or `undefined`.
   * The bridge's decode lookup, which doesn't care which kind it is.
   */
  factoryFor(
    name: string,
  ): (MessageFactory<any> & Transportable<any>) | undefined {
    return this.#messages.get(name) ?? this.#commands.get(name)
  }

  /** Every registered message factory — the bridge relays these one-way. */
  get messageFactories(): Iterable<MessageFactory<any> & Transportable<any>> {
    return this.#messages.values()
  }

  /** Every registered command factory — the bridge relays these as request/reply. */
  get commandFactories(): Iterable<
    CommandMessageFactory<any, any> & Transportable<any>
  > {
    return this.#commands.values()
  }

  #assertUnused(name: string) {
    if (this.#messages.has(name) || this.#commands.has(name))
      throw new Error(`Message "${name}" is already registered`)
  }
}
