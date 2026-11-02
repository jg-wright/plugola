import { message, type MessageFactory } from '../Message/Message.ts'
import {
  command,
  type CommandMessageFactory,
} from '../Message/CommandMessage.ts'

/**
 * A name→factory registry for the messages and commands a bus deals in, and the
 * "defining is registering" rule that keeps their `$name`s unique. Calling
 * {@link MessageRegistry.prototype.registerMessage} / {@link MessageRegistry.prototype.registerCommand}
 * creates the factory (via {@link message} / {@link command}) and records it in one
 * act, so a registered message can't be forgotten, and a name can't be reused.
 *
 * This base registry is purely in-process: it adds no transport codec, so it does
 * not require its messages to be {@link Transportable}. A factory it hands back
 * routes on the bus by identity exactly like a bare `message(...)`/`command(...)`
 * would — the registry only adds name-collision safety and a `$name`→factory
 * lookup. For a registry whose factories can also cross a
 * {@link MessagingBridge}, see {@link TransportableMessageRegistry}, which layers
 * a codec onto each one at registration time.
 *
 * The two generic parameters let a subclass narrow the stored/returned factory
 * type (e.g. to `& Transportable`); by default they are the plain factory types.
 *
 * @example
 * ```ts
 * export const registry = new MessageRegistry()
 * export const UserLoggedIn = registry.registerMessage<{ userId: string }>('user-logged-in')
 * export const Ping = registry.registerCommand<{}, 'pong'>('ping')
 * ```
 */
export class MessageRegistry<
  MFs extends Record<string, MessageFactory<any>> = Record<
    string,
    MessageFactory<any>
  >,
  CFs extends Record<string, CommandMessageFactory<any, any>> = Record<
    string,
    CommandMessageFactory<any, any>
  >,
> {
  readonly #messages = {} as MFs

  readonly #commands = {} as CFs

  static create(): MessageRegistry<{}, {}> {
    return new MessageRegistry()
  }

  /**
   * Merges several registries into one fresh registry that holds every message
   * and command factory from all of them. Factories are reused as-is (identity is
   * preserved, so routing still works), and a name that collides across the inputs
   * throws — the combined registry keeps the same global-uniqueness guarantee a
   * single registry has.
   *
   * Honors the subclass it is called on: `TransportableMessageRegistry.combine(...)`
   * produces a `TransportableMessageRegistry`.
   */
  static combine<MRs extends MessageRegistry[]>(
    ...messageRegistries: MRs
  ): CombineMessageRegistries<MRs> {
    const combined = new this() as MessageRegistry<any, any>
    for (const registry of messageRegistries) {
      for (const [name, factory] of Object.entries(registry.messages)) {
        combined.assertUnregistered(name)
        combined.registerMessage(name, factory)
      }
      for (const [name, factory] of Object.entries(registry.commands)) {
        combined.assertUnregistered(name)
        combined.registerCommand(name, factory)
      }
    }
    return combined as CombineMessageRegistries<MRs>
  }

  get messages() {
    return this.#messages
  }

  get commands() {
    return this.#commands
  }

  /**
   * Defines a data {@link Message} factory under `name` and registers it, in one
   * act. Throws if `name` is already registered (as either a message or command).
   */
  message<Name extends string>(name: Name) {
    this.assertUnregisteredMessage(name)
    return {
      as: <T extends object = {}>(): MessageRegistry<
        MFs & { [N in Name]: MessageFactory<T, Name> },
        CFs
      > => {
        const factory = message<T, Name>(name)
        this.registerMessage(name, factory)
        return this as MessageRegistry<any, any>
      },
    }
  }

  /**
   * Defines a {@link CommandMessage} factory under `name` and registers it, in
   * one act. Throws if `name` is already registered (as either a message or
   * command).
   *
   * @returns the created factory — call it to build commands, and
   * `invoke`/`register` responders with it as usual.
   */
  command<Name extends string>(name: Name) {
    this.assertUnregisteredCommand(name)
    return {
      as: <T extends object = {}, R = unknown>(): MessageRegistry<
        MFs,
        CFs & { [N in Name]: CommandMessageFactory<R, T, Name> }
      > => {
        const factory = command<T, R, Name>(name)
        this.registerCommand(name, factory)
        return this as MessageRegistry<any, any>
      },
    }
  }

  messageFactoryFor<Name extends keyof MFs>(name: Name): MFs[Name] {
    return this.#messages[name]
  }

  commandFactoryFor<Name extends keyof CFs>(name: Name): CFs[Name] {
    return this.#commands[name]
  }

  /** Every registered message factory. */
  get messageFactories(): MFs[string][] {
    return Object.values(this.#messages) as MFs[string][]
  }

  /** Every registered command factory. */
  get commandFactories(): CFs[string][] {
    return Object.values(this.#commands) as CFs[string][]
  }

  protected assertUnregisteredMessage(name: string) {
    this.assertUnregistered(name)
  }

  protected assertUnregisteredCommand(name: string) {
    this.assertUnregistered(name)
  }

  /** Throws if `name` is already taken by a message or a command. */
  protected assertUnregistered(name: string) {
    if (name in this.#messages)
      throw new Error(`Message "${name}" is already registered`)
    if (name in this.#commands)
      throw new Error(`Command "${name}" is already registered`)
  }

  protected registerMessage(name: string, factory: MessageFactory) {
    this.#messages[name as keyof MFs] = factory as MFs[keyof MFs]
  }

  protected registerCommand(name: string, factory: CommandMessageFactory) {
    this.#commands[name as keyof CFs] = factory as CFs[keyof CFs]
  }
}

export type MessageFactories<MR extends MessageRegistry<any, any>> =
  MR extends MessageRegistry<infer MFs, any> ? MFs : never

export type CommandFactories<MR extends MessageRegistry<any, any>> =
  MR extends MessageRegistry<any, infer CFs> ? CFs : never

export type MessageNames<MR extends MessageRegistry<any, any>> =
  MR extends MessageRegistry<infer MFs, any> ? keyof MFs & string : never

export type CombineMessageRegistries<MRs extends MessageRegistry[]> =
  MessageRegistry<MergeMessageFactories<MRs>, MergeCommandFactories<MRs>>

type MergeMessageFactories<
  MRs extends MessageRegistry[],
  Acc = {},
> = MRs extends [
  MessageRegistry<infer MFs, any>,
  ...infer Rest extends MessageRegistry[],
]
  ? MergeMessageFactories<Rest, Acc & MFs>
  : Acc

type MergeCommandFactories<
  MRs extends MessageRegistry[],
  Acc = {},
> = MRs extends [
  MessageRegistry<any, infer CFs>,
  ...infer Rest extends MessageRegistry[],
]
  ? MergeCommandFactories<Rest, Acc & CFs>
  : Acc
