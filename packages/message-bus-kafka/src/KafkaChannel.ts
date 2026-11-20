import type { Channel, Frame } from '@plugola/message-bus'
import type { KafkaConsumer, KafkaProducer } from './Kafka.ts'
import { parseValue } from './value.ts'
import { KafkaChannelDecodeError, KafkaChannelSendError } from './Error.ts'

/**
 * A {@link Channel} over a pair of Kafka topics: frames are produced to
 * `topics.send` and consumed from `topics.receive`. The peer's channel is the
 * mirror image — its `send` is our `receive` — so the two topics form the duplex
 * pipe a `MessagingBridge` expects.
 *
 * The channel takes clients you have already created and connected, typed
 * structurally ({@link KafkaProducer}, {@link KafkaConsumer}) so it works with
 * `kafkajs` or the KafkaJS-compatible API of `@confluentinc/kafka-javascript`.
 * You own their lifecycle: call {@link flush} before disconnecting the producer
 * so no buffered frame is lost.
 *
 * **Ordering.** Frames are sent in batches, one batch at a time, and by default
 * every frame carries the same key — so they share a partition and the peer
 * consumes them in the order they were sent, as an in-process bus would deliver
 * them. Pass a `key` to spread frames across partitions, at the cost of order
 * between frames with different keys.
 *
 * **Topology.** This is a point-to-point channel: one bridge on each side. If
 * several consumers share the receive topic's group, a command's responses may be
 * consumed by an instance that didn't send the command, and are dropped there.
 *
 * @example
 * ```ts
 * // browser-facing server
 * new MessagingBridge(bus, new KafkaChannel({
 *   producer, consumer,
 *   topics: { send: 'web-to-billing', receive: 'billing-to-web' },
 *   onError: (error) => logger.error(error),
 * }), registry)
 *
 * // billing service
 * new MessagingBridge(bus, new KafkaChannel({
 *   producer, consumer,
 *   topics: { send: 'billing-to-web', receive: 'web-to-billing' },
 *   onError: (error) => logger.error(error),
 * }), registry)
 * ```
 */
export class KafkaChannel implements Channel {
  readonly #producer: KafkaProducer
  readonly #consumer: KafkaConsumer
  readonly #topics: KafkaChannelTopics
  readonly #key: (frame: Frame) => string | null
  readonly #fromBeginning?: boolean
  readonly #onError: (error: unknown) => void
  readonly #handlers = new Set<(frame: Frame) => void>()
  readonly #outbox: Frame[] = []
  #sending?: Promise<void>
  #consuming = false
  /** `run` has resolved, so the consumer can be paused and resumed. */
  #running = false
  #paused = false

  constructor({
    producer,
    consumer,
    topics,
    key = () => topics.send,
    fromBeginning,
    onError,
  }: KafkaChannelOptions) {
    this.#producer = producer
    this.#consumer = consumer
    this.#topics = topics
    this.#key = key
    this.#fromBeginning = fromBeginning
    this.#onError = onError
  }

  /**
   * Queues `frame` for the send topic. Frames queued while a batch is in flight
   * go out together in the next batch, after it. A failed batch is reported to
   * `onError` as a {@link KafkaChannelSendError} and is not retried.
   */
  send(frame: Frame) {
    this.#outbox.push(frame)
    this.#sending ??= this.#drain()
  }

  /**
   * Registers a handler for frames from the receive topic. The first call
   * subscribes the consumer and runs it, so nothing is consumed (and no offset
   * committed) before there is a handler to deliver to. Likewise, while every
   * handler is disposed the consumer is paused, so frames that arrive meanwhile
   * stay uncommitted — they're delivered once a handler is registered again, or
   * to the group's next consumer.
   */
  receive(handler: (frame: Frame) => void) {
    this.#handlers.add(handler)
    if (!this.#consuming) {
      this.#consuming = true
      this.#consume()
    }
    this.#syncPaused()
    return () => {
      this.#handlers.delete(handler)
      this.#syncPaused()
    }
  }

  /** Resolves once every frame sent so far has been handed to the producer. */
  async flush() {
    while (this.#sending) await this.#sending
  }

  async #drain() {
    // Yield once so every frame sent in the current task joins the first batch.
    await Promise.resolve()
    try {
      while (this.#outbox.length) {
        const frames = this.#outbox.splice(0)
        try {
          await this.#producer.send({
            topic: this.#topics.send,
            messages: frames.map((frame) => ({
              key: this.#key(frame),
              value: JSON.stringify(frame),
            })),
          })
        } catch (error) {
          this.#onError(new KafkaChannelSendError(frames, { cause: error }))
        }
      }
    } finally {
      this.#sending = undefined
    }
  }

  async #consume() {
    try {
      await this.#consumer.subscribe({
        topics: [this.#topics.receive],
        ...(this.#fromBeginning === undefined
          ? {}
          : { fromBeginning: this.#fromBeginning }),
      })
      await this.#consumer.run({
        eachMessage: async ({ message }) => this.#deliver(message.value),
      })
      this.#running = true
      // Every handler may have been disposed while the consumer was starting.
      this.#syncPaused()
    } catch (error) {
      this.#onError(error)
    }
  }

  /** Pauses the consumer while there is no handler, and resumes it after. */
  #syncPaused() {
    const paused = this.#handlers.size === 0
    if (!this.#running || paused === this.#paused) return
    this.#paused = paused
    const topics = [{ topic: this.#topics.receive }]
    try {
      if (paused) this.#consumer.pause(topics)
      else this.#consumer.resume(topics)
    } catch (error) {
      this.#onError(error)
    }
  }

  #deliver(value: Uint8Array | string | null) {
    const frame = decodeFrame(value)
    if (!frame) {
      this.#onError(new KafkaChannelDecodeError(value))
      return
    }
    // A throwing handler must not fail the Kafka message, or the consumer would
    // retry it forever and stall the partition.
    for (const handler of this.#handlers)
      try {
        handler(frame)
      } catch (error) {
        this.#onError(error)
      }
  }
}

/** Constructor options for a {@link KafkaChannel}. */
export interface KafkaChannelOptions {
  /** A connected producer; the channel only calls `send`. */
  producer: KafkaProducer
  /**
   * A connected consumer, dedicated to this channel: the channel subscribes it
   * to `topics.receive` and runs it, which a consumer allows only once, and
   * pauses it while no handler is registered.
   */
  consumer: KafkaConsumer
  topics: KafkaChannelTopics
  /**
   * The Kafka key for each outbound frame, which picks its partition. Defaults
   * to `topics.send` for every frame, keeping all frames on one partition and so
   * in order.
   */
  key?: (frame: Frame) => string | null
  /**
   * Passed to `consumer.subscribe` when set (a `kafkajs` option). With
   * `@confluentinc/kafka-javascript`, set `fromBeginning` in the consumer's
   * config instead.
   */
  fromBeginning?: boolean
  /**
   * Receives every asynchronous failure: a batch the producer rejected
   * ({@link KafkaChannelSendError}), a Kafka message that isn't a frame
   * ({@link KafkaChannelDecodeError}), a throwing receive handler, or the
   * consumer failing to subscribe, run, pause or resume. It must not throw.
   *
   * A lost command frame leaves the caller's `invoke` waiting until it is
   * aborted, so consider pairing invokes with a timeout signal.
   */
  onError(error: unknown): void
}

/** The pair of topics that make up the duplex channel. */
export interface KafkaChannelTopics {
  /** The topic outbound frames are produced to (the peer's `receive`). */
  send: string
  /** The topic inbound frames are consumed from (the peer's `send`). */
  receive: string
}

/** Parses a Kafka message value as a frame, or `undefined` if it isn't one. */
function decodeFrame(value: Uint8Array | string | null): Frame | undefined {
  const data = parseValue(value)
  return isFrame(data) ? data : undefined
}

function isFrame(data: unknown): data is Frame {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { kind?: unknown }).kind === 'string'
  )
}
