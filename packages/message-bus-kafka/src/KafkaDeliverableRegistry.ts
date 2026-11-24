import type { KafkaCommandSink } from './KafkaCommandSink.ts'
import type { KafkaCommandSource } from './KafkaCommandSource.ts'
import {
  type CodecArgs,
  type CommandMessage,
  type CommandMessageFactory,
  type MessageOf,
  type PayloadOf,
  type Transportable,
  TransportableMessageRegistry,
} from '@plugola/message-bus'

/**
 * A {@link TransportableMessageRegistry} of the commands a {@link KafkaCommandSink}
 * publishes and a {@link KafkaCommandSource} handles: the contract both sides
 * share.
 *
 * A record on a topic travels one way, so nothing can come back to the caller.
 * The registry holds only commands, and only ones whose response type is `void`.
 * Both limits are checked when you compile:
 *
 * - `command(name).as<T>()` declares a `void` command; giving it another
 *   response type (`.as<T, string>()`) doesn't compile.
 * - `addCommand` accepts a factory only if it was declared `void`, as in
 *   `command<T, void>(name)`. One declared without a response type responds
 *   with `unknown`, so it is rejected too.
 * - `message` and `addMessage` don't compile (and throw if called anyway).
 *
 * Each registration returns a `KafkaDeliverableRegistry`, so a chain keeps these
 * limits, and the sink and source accept only this registry.
 *
 * @example
 * ```ts
 * export const orders = KafkaDeliverableRegistry.create()
 *   .command('process-order')
 *   .as<{ orderId: string }>()
 *   .addCommand(cancelOrder) // declared as command<{ orderId: string }, void>('cancel-order')
 *
 * new KafkaCommandSink(bus, { producer, topic: 'orders', registry: orders })
 * ```
 */
export class KafkaDeliverableRegistry<
  CFs extends Record<string, CommandMessageFactory<void>> = Record<
    string,
    CommandMessageFactory<void> & Transportable<CommandMessage<void>>
  >,
> extends TransportableMessageRegistry<{}, CFs, void> {
  /** An empty registry, to build up with {@link command} and {@link addCommand}. */
  static override create(): KafkaDeliverableRegistry<{}> {
    return new KafkaDeliverableRegistry()
  }

  /**
   * Not supported: a Kafka sink and source carry only commands. Its parameter is
   * `never`, so a call doesn't compile.
   * @throws always.
   */
  override message(_name: never): never {
    throw new Error(
      'A KafkaDeliverableRegistry holds only commands, not messages.',
    )
  }

  /**
   * Declares a command, completed by `.as<T>()` with its payload type `T`. Its
   * response type is `void`, and can't be anything else.
   */
  override command<Name extends string>(
    name: Name,
  ): { as: KafkaDeliverableCommandAs<Name, CFs> } {
    return super.command(name) as { as: KafkaDeliverableCommandAs<Name, CFs> }
  }

  /**
   * Not supported: a Kafka sink and source carry only commands. Its parameter is
   * `never`, so a call doesn't compile.
   * @throws always.
   */
  override addMessage(_factory: never, ..._codec: any[]): never {
    throw new Error(
      'A KafkaDeliverableRegistry holds only commands, not messages.',
    )
  }

  /**
   * Adds a command factory defined elsewhere with `command()`. It must have been
   * declared with a `void` response type (`command<T, void>(name)`); give it a
   * literal `Name` too (`command<T, void, 'name'>('name')`) to reach it through
   * {@link commands}.
   */
  // Checks the built message, not `CommandMessageFactory<void, any>`: its `any`
  // payload widens the message to `any`, which would let any response through.
  override addCommand<
    F extends CommandMessageFactory<any, any> &
      ((...args: any) => CommandMessage<void>),
  >(
    factory: F,
    ...codec: CodecArgs<PayloadOf<F>, MessageOf<F>>
  ): KafkaDeliverableRegistry<CFs & Entry<F>> {
    return super.addCommand(factory, ...codec) as KafkaDeliverableRegistry<
      CFs & Entry<F>
    >
  }
}

/**
 * What {@link KafkaDeliverableRegistry.command} returns: as `TransportableCommandAs`,
 * but `R` is bounded by `void` and the registry it returns is still a
 * `KafkaDeliverableRegistry`.
 */
export interface KafkaDeliverableCommandAs<
  Name extends string,
  CFs extends Record<string, CommandMessageFactory<void>>,
> {
  <T extends object = {}, R extends void = void>(
    ...codec: CodecArgs<T, CommandMessage<R> & T>
  ): KafkaDeliverableRegistry<
    CFs & {
      [N in Name]: CommandMessageFactory<R, T, Name> &
        Transportable<CommandMessage<R> & T>
    }
  >
}

/** The registry entry for an added factory; see `TransportableMessageRegistry.addCommand`. */
type Entry<F extends CommandMessageFactory<any, any>> =
  string extends F['$name']
    ? {}
    : { [N in F['$name']]: F & Transportable<MessageOf<F>> }
