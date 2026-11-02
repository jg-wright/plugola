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
    return {
      as: <T extends object = {}>(
        codec?: Partial<Codec<Message & T>>,
      ): TransportableMessageRegistry<
        MFs & { [N in Name]: MessageFactory<T, Name> & Transportable<T> },
        CFs
      > => {
        const factory = makeTransportable(message<T>(name), codec)
        this.registerMessage(name, factory)
        return this as TransportableMessageRegistry<any, any>
      },
    }
  }

  override command<Name extends string>(name: Name) {
    this.assertUnregisteredCommand(name)
    return {
      as: <T extends object = {}, R = unknown>(
        codec?: Partial<Codec<CommandMessage<R> & T>>,
      ): TransportableMessageRegistry<
        MFs,
        CFs & {
          [N in Name]: CommandMessageFactory<R, T, Name> &
            Transportable<CommandMessage<R> & T>
        }
      > => {
        const factory = makeTransportable(command<T, R>(name), codec)
        this.registerCommand(name, factory)
        return this as TransportableMessageRegistry<any, any>
      },
    }
  }
}
