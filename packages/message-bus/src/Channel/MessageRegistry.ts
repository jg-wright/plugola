import { message, type Message, type MessageClass } from '../Message/Message.ts'
import {
  command,
  type CommandMessage,
  type CommandMessageClass,
} from '../Message/CommandMessage.ts'
import type { Codec } from '../Message/Codec.ts'
import {
  TransportableMixin,
  type Transportable,
} from '../Message/Transportable.ts'

/**
 * The set of message classes that cross a {@link MessagingBridge}, and the
 * contract two buses share to name them. Because a class identity cannot cross a
 * runtime boundary, the registry maps each `$name` to its class so an inbound
 * frame can be resolved back to a constructor and decoded.
 *
 * Defining a message _is_ registering it: {@link MessageRegistry.registerMessage}
 * and {@link MessageRegistry.registerCommand} create the class (via
 * {@link message} / {@link command}) and record it in one act, so a bridged
 * message can't be forgotten. The registry doubles as the bridge's forward set —
 * every class it holds is one the bridge subscribes to and relays.
 *
 * Both ends of a bridge build an equivalent registry from a shared module; the
 * classes are distinct objects per runtime (identity routes locally, names cross
 * the wire).
 *
 * @example
 * ```ts
 * export const registry = new MessageRegistry()
 * export const UserLoggedIn = registry.registerMessage<{ userId: string }>('user-logged-in')
 * export const Ping = registry.registerCommand<{}, 'pong'>('ping')
 * ```
 */
export class MessageRegistry {
  readonly #byName = new Map<string, MessageClass<any> & Transportable<any>>()

  /**
   * Defines a data {@link Message} class under `name` and registers it, in one
   * act. Throws if `name` is already registered.
   *
   * @returns the created class — use it to `emit`/`on` as usual.
   */
  registerMessage<T extends object>(
    name: string,
    codec?: Partial<Codec<T & Message>>,
  ): MessageClass<T> & Transportable<T> {
    const messageClass = TransportableMixin(message<T>(name), codec)
    this.#add(name, messageClass)
    return messageClass
  }

  /**
   * Defines a {@link CommandMessage} class under `name` and registers it, in one
   * act. Throws if `name` is already registered.
   *
   * @returns the created class — use it to `invoke`/`register` responders as usual.
   */
  registerCommand<T extends object, R>(
    name: string,
    codec?: Partial<Codec<CommandMessage<R> & T>>,
  ): CommandMessageClass<R, T> & Transportable<T> {
    const commandClass = TransportableMixin(command<T, R>(name), codec)
    this.#add(name, commandClass)
    return commandClass
  }

  /** The class registered under `name`, or `undefined` — the bridge's decode lookup. */
  classFor(name: string): (MessageClass<any> & Transportable<any>) | undefined {
    return this.#byName.get(name)
  }

  /** Every registered class — the bridge's forward set (what it subscribes to and relays). */
  get classes(): Iterable<MessageClass<any> & Transportable<any>> {
    return this.#byName.values()
  }

  #add(name: string, messageClass: MessageClass<any> & Transportable<any>) {
    if (this.#byName.has(name))
      throw new Error(`Message "${name}" is already registered`)
    this.#byName.set(name, messageClass)
  }
}
