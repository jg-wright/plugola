import {
  isFromWire,
  type CommandMessage,
  type MessageBus,
  type MessageGateway,
  type TransportableMessageRegistry,
} from '@plugola/message-bus'
import type { KafkaProducer } from './Kafka.ts'

/**
 * Publishes commands to a Kafka topic as durable work, for a
 * {@link KafkaCommandSource} (usually in another service) to handle.
 *
 * The sink joins the bus as a participant and registers as a responder for
 * every command in the registry. Invoking one produces a single record and
 * completes once the broker has acknowledged it, so a resolved `invoke` means
 * the work is durably queued, and a rejected one means it wasn't. Responses
 * can't come back over the topic, so these commands' response type should be
 * `void`.
 *
 * The registry is the routing table: give each topic its own sink, listing the
 * commands it carries. A command that came off a wire (e.g. from a
 * {@link KafkaCommandSource}) is never published again.
 *
 * @example
 * ```ts
 * new KafkaCommandSink(bus, { producer, topic: 'orders', registry,
 *   key: (command) => command.orderId })
 *
 * await app.invoke(processOrder({ orderId, items })).collect() // durably queued
 * ```
 */
export class KafkaCommandSink {
  readonly #gateway: MessageGateway

  constructor(
    bus: MessageBus,
    {
      producer,
      topic,
      registry,
      key = () => topic,
      name = `kafka-command-sink:${topic}`,
    }: KafkaCommandSinkOptions,
  ) {
    this.#gateway = bus.gateway(name)

    // Filtered rather than returning early, so a command from the wire doesn't
    // count as handled here (see `invoke`'s `requireResponder`).
    const notFromWire = { $name: (command: object) => !isFromWire(command) }
    for (const factory of registry.commandFactories)
      this.#gateway.register(
        factory,
        notFromWire,
        async (command, { signal }) => {
          signal.throwIfAborted()
          await producer.send({
            topic,
            messages: [
              {
                key: key(command),
                value: JSON.stringify({
                  name: factory.$name,
                  payload: factory.$encode(command),
                }),
              },
            ],
          })
        },
      )
  }

  /** Leaves the bus: commands invoked from now on are no longer published. */
  abort(reason?: unknown) {
    this.#gateway.abort(this.#gateway.name, reason)
  }
}

/** Constructor options for a {@link KafkaCommandSink}. */
export interface KafkaCommandSinkOptions {
  /** A connected producer; the sink only calls `send`. */
  producer: KafkaProducer
  /** The topic records are produced to. */
  topic: string
  /** The commands to publish; shared with the consuming side. */
  registry: TransportableMessageRegistry
  /**
   * The Kafka key for each record, which picks its partition: records with the
   * same key are consumed in order. Defaults to `topic` for every record, so all
   * of them share a partition and are handled in the order they were invoked.
   * Key by entity (e.g. an order id) to spread work across partitions.
   */
  key?: (command: CommandMessage & Record<string, any>) => string | null
  /** The sink's participant name on the bus. Defaults to `kafka-command-sink:<topic>`. */
  name?: string
}
