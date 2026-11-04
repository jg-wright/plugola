import {
  message,
  type Message,
  type MessageFactory,
  type MessageOf,
} from '../Message/Message.ts'
import {
  command,
  type CommandMessage,
  type CommandMessageFactory,
} from '../Message/CommandMessage.ts'
import type { Codec } from '../Message/Codec.ts'
import type { Serializable } from '../Message/Serializable.ts'
import {
  makeTransportable,
  type Transportable,
} from '../Message/Transportable.ts'
import { MessageRegistry } from './MessageRegistry.ts'

/**
 * A {@link MessageRegistry} whose every factory is also {@link Transportable}: the
 * set of message factories that cross a {@link MessagingBridge}, and the contract
 * two buses share to name them. Because a factory identity cannot cross a runtime
 * boundary, the registry maps each `$name` to its factory so an inbound frame can
 * be resolved back to a factory and decoded.
 *
 * Registering here does everything the base registry does, and additionally layers
 * a transport {@link Codec} (`$encode`/`$decode`) onto the factory via
 * {@link makeTransportable} — so defining a bridged message _is_ making it
 * transportable, in one act. The registry doubles as the bridge's forward set:
 * every factory it holds is one the bridge subscribes to and relays.
 *
 * Both ends of a bridge build an equivalent registry from a shared module; the
 * factories are distinct objects per runtime (identity routes locally, names
 * cross the wire).
 *
 * @example
 * ```ts
 * export const registry = new TransportableMessageRegistry()
 * export const UserLoggedIn = registry.registerMessage<{ userId: string }>('user-logged-in')
 * export const Ping = registry.registerCommand<{}, 'pong'>('ping')
 * ```
 */
export class TransportableMessageRegistry<
  MFs extends Record<string, MessageFactory<any>> = Record<
    string,
    MessageFactory<any> & Transportable<any>
  >,
  CFs extends Record<string, CommandMessageFactory<any, any>> = Record<
    string,
    CommandMessageFactory<any, any> & Transportable<CommandMessage<any> & any>
  >,
> extends MessageRegistry<MFs, CFs> {
  static override create(): TransportableMessageRegistry<{}, {}> {
    return new TransportableMessageRegistry()
  }

  override message<Name extends string>(name: Name) {
    this.assertUnregisteredMessage(name)
    const as = (codec?: Partial<Codec<Message>>) => {
      this.registerMessage(name, makeTransportable(message(name), codec))
      return this as TransportableMessageRegistry<any, any>
    }
    return { as: as as TransportableMessageAs<Name, MFs, CFs> }
  }

  override command<Name extends string>(name: Name) {
    this.assertUnregisteredCommand(name)
    const as = (codec?: Partial<Codec<CommandMessage>>) => {
      this.registerCommand(name, makeTransportable(command(name), codec))
      return this as TransportableMessageRegistry<any, any>
    }
    return { as: as as TransportableCommandAs<Name, MFs, CFs> }
  }

  /**
   * Adds a message factory defined elsewhere — with {@link message}, in a module
   * the rest of the app already imports — and makes it transportable, so the
   * same factory routes locally and crosses a bridge. The factory is registered
   * under its `$name`.
   *
   * A `codec` replaces the factory's; without one, a factory that is already
   * transportable (added to another registry) keeps its codec, and any other
   * gets the default. Throws if the name is already registered.
   *
   * @example
   * ```ts
   * import { UserActive } from './messages.ts'
   * export const registry = TransportableMessageRegistry.create().addMessage(UserActive)
   * ```
   */
  addMessage<F extends MessageFactory<any>>(
    factory: F,
    ...codec: CodecArgs<PayloadOf<F>, MessageOf<F>>
  ): TransportableMessageRegistry<MFs & Entry<F>, CFs> {
    this.assertUnregisteredMessage(factory.$name)
    this.registerMessage(factory.$name, adopt(factory, codec[0]))
    return this as TransportableMessageRegistry<any, any>
  }

  /** As {@link addMessage}, for a command factory defined with {@link command}. */
  addCommand<F extends CommandMessageFactory<any, any>>(
    factory: F,
    ...codec: CodecArgs<PayloadOf<F>, MessageOf<F>>
  ): TransportableMessageRegistry<MFs, CFs & Entry<F>> {
    this.assertUnregisteredCommand(factory.$name)
    this.registerCommand(factory.$name, adopt(factory, codec[0]))
    return this as TransportableMessageRegistry<any, any>
  }
}

/** Makes `factory` transportable, keeping the codec it already has unless given one. */
function adopt<F extends (...args: any) => any>(
  factory: F,
  codec: Partial<Codec<MessageOf<F>>> | undefined,
) {
  return codec || !isTransportable(factory)
    ? makeTransportable(factory, codec)
    : factory
}

function isTransportable(factory: object): boolean {
  return (
    typeof (factory as Partial<Transportable<unknown>>).$encode === 'function'
  )
}

/** A factory's payload: the message it builds, less the framework's `$` metadata. */
type PayloadOf<F> = Omit<MessageOf<F>, `$${string}`>

/**
 * The registry entry for an added factory. A factory defined without a literal
 * name (`message<T>('x')` widens it to `string`) can't be looked up by name in
 * the registry's types, so it adds nothing to them; it is still registered.
 */
type Entry<F extends { $name: string }> = string extends F['$name']
  ? {}
  : { [N in F['$name']]: F & Transportable<MessageOf<F>> }

/**
 * Registers a transportable message. With the default codec the payload is what
 * crosses the wire, so it must be {@link Serializable}; a payload that isn't
 * (one holding a DOM node, a `Date`, a callback, …) requires a full custom
 * codec, which decides what crosses instead.
 */
interface TransportableMessageAs<
  Name extends string,
  MFs extends Record<string, MessageFactory<any>>,
  CFs extends Record<string, CommandMessageFactory<any, any>>,
> {
  <T extends object = {}>(
    ...codec: CodecArgs<T, Message & T>
  ): WithMessage<Name, T, MFs, CFs>
}

/** As {@link TransportableMessageAs}, for commands. */
interface TransportableCommandAs<
  Name extends string,
  MFs extends Record<string, MessageFactory<any>>,
  CFs extends Record<string, CommandMessageFactory<any, any>>,
> {
  <T extends object = {}, R = unknown>(
    ...codec: CodecArgs<T, CommandMessage<R> & T>
  ): WithCommand<Name, T, R, MFs, CFs>
}

type CodecArgs<T, M> = [T] extends [Serializable<T>]
  ? [codec?: Partial<Codec<M>>]
  : [codec: Codec<M>]

type WithMessage<
  Name extends string,
  T extends object,
  MFs extends Record<string, MessageFactory<any>>,
  CFs extends Record<string, CommandMessageFactory<any, any>>,
> = TransportableMessageRegistry<
  MFs & { [N in Name]: MessageFactory<T, Name> & Transportable<T> },
  CFs
>

type WithCommand<
  Name extends string,
  T extends object,
  R,
  MFs extends Record<string, MessageFactory<any>>,
  CFs extends Record<string, CommandMessageFactory<any, any>>,
> = TransportableMessageRegistry<
  MFs,
  CFs & {
    [N in Name]: CommandMessageFactory<R, T, Name> &
      Transportable<CommandMessage<R> & T>
  }
>
