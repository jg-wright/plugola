import {
  markFromWire,
  type CommandMessage,
  type MessageBus,
  type MessageGateway,
} from '@plugola/message-bus'
import type { KafkaConsumer, KafkaEachMessagePayload } from './Kafka.ts'
import { KafkaCommandDecodeError, KafkaCommandError } from './Error.ts'
import { parseValue } from './value.ts'
import type { KafkaDeliverableRegistry } from './KafkaDeliverableRegistry.ts'

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
 * To stop a record that keeps failing from holding up its partition, pass
 * `deadLetter`: once its command has failed `maxAttempts` times, the record is
 * handed to `deadLetter.publish` and committed once that resolves. Undecodable
 * records go to it straight away.
 *
 * A record can be handled more than once (after a crash or a rebalance), so
 * responders should be idempotent. The registry is a
 * {@link KafkaDeliverableRegistry}, so every command responds with `void`: there
 * is no caller to send a response to.
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
  readonly #registry: KafkaDeliverableRegistry
  readonly #fromBeginning?: boolean
  readonly #partitionsConsumedConcurrently?: number
  readonly #heartbeatInterval: number
  readonly #onError: (error: unknown) => void
  readonly #deadLetter?: KafkaCommandSourceOptions['deadLetter']
  /** Failed attempts so far, by `partition:offset`, for records not yet committed. */
  readonly #attempts = new Map<string, number>()
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
      deadLetter,
    }: KafkaCommandSourceOptions,
  ) {
    if (deadLetter && !(deadLetter.maxAttempts >= 1))
      throw new RangeError('deadLetter.maxAttempts must be at least 1')
    this.#gateway = bus.gateway(name)
    this.#consumer = consumer
    this.#topic = topic
    this.#registry = registry
    this.#fromBeginning = fromBeginning
    this.#partitionsConsumedConcurrently = partitionsConsumedConcurrently
    this.#heartbeatInterval = heartbeatInterval
    this.#onError = onError
    this.#deadLetter = deadLetter
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

  /** Resolving commits the record; throwing leaves it to be retried. */
  async #handle({ partition, message, heartbeat }: KafkaEachMessagePayload) {
    const signal = this.#aborted.signal
    signal.throwIfAborted()
    const record = {
      topic: this.#topic,
      partition,
      offset: message.offset,
      value: message.value,
    }

    const command = this.#decode(message.value)
    if (command instanceof KafkaCommandDecodeError) {
      this.#onError(command)
      if (this.#deadLetter)
        await this.#publishDeadLetter({
          ...record,
          error: command,
          attempts: 0,
        })
      return
    }

    const id = `${partition}:${message.offset}`
    try {
      await this.#invoke(command, heartbeat)
    } catch (error) {
      if (signal.aborted) throw error
      this.#onError(error)
      const attempts = (this.#attempts.get(id) ?? 0) + 1
      this.#attempts.set(id, attempts)
      if (!this.#deadLetter || attempts < this.#deadLetter.maxAttempts)
        throw error
      await this.#publishDeadLetter({ ...record, command, error, attempts })
    }
    this.#attempts.delete(id)
  }

  /** Invokes `command`, throwing if any responder threw or none ran. */
  async #invoke(command: CommandMessage, heartbeat: () => Promise<void>) {
    const signal = this.#aborted.signal
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
    } finally {
      clearInterval(beat)
    }
    // An aborted invoke completes rather than rejecting, but the work may be
    // unfinished, so the record must not be committed.
    signal.throwIfAborted()
    if (errors.length) throw new KafkaCommandError(command, errors)
  }

  async #publishDeadLetter(letter: KafkaDeadLetter) {
    try {
      await this.#deadLetter!.publish(letter)
    } catch (error) {
      this.#onError(error)
      throw error
    }
  }

  /** The record as a command marked from the wire, or why it isn't one. */
  #decode(
    value: Uint8Array | string | null,
  ): CommandMessage | KafkaCommandDecodeError {
    const record = parseValue(value)
    const factory =
      isCommandRecord(record) && this.#registry.commandFactoryFor(record.name)
    if (!factory) return new KafkaCommandDecodeError(value)
    try {
      return markFromWire(factory.$decode(record.payload))
    } catch (cause) {
      return new KafkaCommandDecodeError(value, { cause })
    }
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
  /**
   * The commands to handle, shared with the producing side's
   * {@link KafkaCommandSink}. Only `void` commands fit: see
   * {@link KafkaDeliverableRegistry}.
   */
  registry: KafkaDeliverableRegistry
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
   * ({@link KafkaCommandDecodeError}), a command that failed
   * ({@link KafkaCommandError} or `NoResponderError`), or a failed dead letter,
   * heartbeat or pause. It must not throw.
   */
  onError(error: unknown): void
  /**
   * Where records go instead of holding up their partition forever. Without it,
   * a failing record is retried until it succeeds, and an undecodable one is
   * committed (dropped).
   */
  deadLetter?: {
    /**
     * How many times a record's command may fail before the record is
     * dead-lettered; at least 1. Attempts are counted in memory, so they start
     * again after a restart or rebalance: a record may be tried more often, but
     * never less.
     */
    maxAttempts: number
    /**
     * Sends a failed record somewhere it can be inspected or replayed, such as a
     * dead-letter topic. Resolving commits the record; throwing leaves it to be
     * retried (command first).
     */
    publish(letter: KafkaDeadLetter): Promise<void>
  }
}

/** A record a {@link KafkaCommandSource} gave up on, handed to `deadLetter.publish`. */
export interface KafkaDeadLetter {
  topic: string
  partition: number
  offset: string
  /** The record's value as consumed, to republish as is. */
  value: Uint8Array | string | null
  /** The decoded command, unless the record couldn't be decoded. */
  command?: CommandMessage
  /**
   * Why: the last attempt's error ({@link KafkaCommandError} or
   * `NoResponderError`), or a {@link KafkaCommandDecodeError}.
   */
  error: unknown
  /** How many times the command failed; 0 if the record couldn't be decoded. */
  attempts: number
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
