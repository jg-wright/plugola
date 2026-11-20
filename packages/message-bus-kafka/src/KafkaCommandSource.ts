import {
  markFromWire,
  type CommandMessage,
  type MessageBus,
  type MessageGateway,
  type TransportableMessageRegistry,
} from '@plugola/message-bus'
import type { KafkaConsumer, KafkaEachMessagePayload } from './Kafka.ts'
import { KafkaCommandDecodeError, KafkaCommandError } from './Error.ts'
import { parseValue } from './value.ts'

/**
 * Handles commands from a Kafka topic (published by a {@link KafkaCommandSink})
 * by invoking them on a bus, and commits each record only once that succeeds,
 * so failed work is retried.
 *
 * For each record the source invokes the command and waits for every responder
 * to settle:
 *
 * - **Success** (every responder that ran resolved) commits the record.
 * - **Failure** leaves it uncommitted, so the consumer retries it, per its
 *   `retry` config, then from the last committed offset after a restart. That
 *   holds up the record's partition until it succeeds. Failure means a
 *   responder threw ({@link KafkaCommandError}) or no responder ran: none was
 *   registered, every one was paused, or none matched its filter
 *   (`NoResponderError`).
 * - **An undecodable record** (not JSON, or not a command in the registry) is
 *   reported as a {@link KafkaCommandDecodeError} and committed, so it can't
 *   hold up the partition forever.
 *
 * A record can be handled more than once (after a crash or a rebalance), so
 * responders should be idempotent. Anything they `send` is discarded.
 *
 * @example
 * ```ts
 * const source = new KafkaCommandSource(bus, {
 *   consumer, topic: 'orders', registry,
 *   onError: (error) => logger.warn(error),
 * })
 * app.register(processOrder, async (command) => { await save(command) })
 * await source.start()
 * ```
 */
export class KafkaCommandSource {
  readonly #gateway: MessageGateway
  readonly #consumer: KafkaConsumer
  readonly #topic: string
  readonly #registry: TransportableMessageRegistry
  readonly #fromBeginning?: boolean
  readonly #partitionsConsumedConcurrently?: number
  readonly #heartbeatInterval: number
  readonly #onError: (error: unknown) => void
  readonly #aborted = new AbortController()
  #running = false

  constructor(
    bus: MessageBus,
    {
      consumer,
      topic,
      registry,
      fromBeginning,
      partitionsConsumedConcurrently,
      heartbeatInterval = 3_000,
      name = `kafka-command-source:${topic}`,
      onError,
    }: KafkaCommandSourceOptions,
  ) {
    this.#gateway = bus.gateway(name)
    this.#consumer = consumer
    this.#topic = topic
    this.#registry = registry
    this.#fromBeginning = fromBeginning
    this.#partitionsConsumedConcurrently = partitionsConsumedConcurrently
    this.#heartbeatInterval = heartbeatInterval
    this.#onError = onError
    this.#gateway.onAbort((reason) => this.#stop(reason))
  }

  /**
   * Subscribes the consumer to the topic and runs it. Register the responders
   * first: until one is, every record fails and is retried.
   */
  async start() {
    await this.#consumer.subscribe({
      topics: [this.#topic],
      ...(this.#fromBeginning === undefined
        ? {}
        : { fromBeginning: this.#fromBeginning }),
    })
    await this.#consumer.run({
      ...(this.#partitionsConsumedConcurrently === undefined
        ? {}
        : {
            partitionsConsumedConcurrently:
              this.#partitionsConsumedConcurrently,
          }),
      eachMessage: (payload) => this.#handle(payload),
    })
    this.#running = true
    if (this.#aborted.signal.aborted) this.#pause()
  }

  /**
   * Leaves the bus and pauses the consumer. A command still being handled is
   * aborted (its responders' `signal` fires) and its record left uncommitted,
   * for the group's next consumer.
   */
  abort(reason?: unknown) {
    this.#gateway.abort(this.#gateway.name, reason)
  }

  async #handle({ message, heartbeat }: KafkaEachMessagePayload) {
    const signal = this.#aborted.signal
    signal.throwIfAborted()

    const command = this.#decode(message.value)
    if (!command) return

    const errors: unknown[] = []
    const beat = setInterval(
      () => heartbeat().catch(this.#onError),
      this.#heartbeatInterval,
    )
    try {
      await this.#gateway
        .invoke(command, {
          signal,
          requireResponder: true,
          onError: (error) => errors.push(error),
        })
        .collect()
      // An aborted invoke completes rather than rejecting, but the work may be
      // unfinished, so the record must not be committed.
      signal.throwIfAborted()
      if (errors.length) throw new KafkaCommandError(command, errors)
    } catch (error) {
      if (!signal.aborted) this.#onError(error)
      throw error
    } finally {
      clearInterval(beat)
    }
  }

  /** The record as a command marked from the wire, or `undefined` (reported) if it isn't one. */
  #decode(value: Uint8Array | string | null): CommandMessage | undefined {
    const record = parseValue(value)
    const factory =
      isCommandRecord(record) && this.#registry.commandFactoryFor(record.name)
    try {
      if (factory) return markFromWire(factory.$decode(record.payload))
      this.#onError(new KafkaCommandDecodeError(value))
    } catch (cause) {
      this.#onError(new KafkaCommandDecodeError(value, { cause }))
    }
    return undefined
  }

  #stop(reason: unknown) {
    this.#aborted.abort(reason)
    if (this.#running) this.#pause()
  }

  #pause() {
    try {
      this.#consumer.pause([{ topic: this.#topic }])
    } catch (error) {
      this.#onError(error)
    }
  }
}

/** Constructor options for a {@link KafkaCommandSource}. */
export interface KafkaCommandSourceOptions {
  /**
   * A connected consumer, dedicated to this source: it subscribes it to `topic`
   * and runs it, which a consumer allows only once. Leave its auto-commit on:
   * the source acknowledges a record by resolving it.
   */
  consumer: KafkaConsumer
  /** The topic to consume commands from. */
  topic: string
  /** The commands to handle; shared with the producing side. */
  registry: TransportableMessageRegistry
  /**
   * Passed to `consumer.subscribe` when set (a `kafkajs` option). With
   * `@confluentinc/kafka-javascript`, set `fromBeginning` in the consumer's
   * config instead.
   */
  fromBeginning?: boolean
  /**
   * How many partitions to handle at once (passed to `consumer.run`). Records
   * within a partition are always handled one at a time, in order.
   */
  partitionsConsumedConcurrently?: number
  /**
   * How often, in ms, to heartbeat while a command is being handled, so a slow
   * one doesn't get the partition rebalanced away. Defaults to 3000, kafkajs's
   * default `heartbeatInterval`.
   */
  heartbeatInterval?: number
  /** The source's participant name on the bus. Defaults to `kafka-command-source:<topic>`. */
  name?: string
  /**
   * Receives every failure: a record that isn't a known command
   * ({@link KafkaCommandDecodeError}, then committed), a command that failed
   * ({@link KafkaCommandError} or `NoResponderError`, then retried), or a failed
   * heartbeat or pause. It must not throw.
   */
  onError(error: unknown): void
}

interface CommandRecord {
  name: string
  payload: unknown
}

function isCommandRecord(data: unknown): data is CommandRecord {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { name?: unknown }).name === 'string' &&
    'payload' in data
  )
}
