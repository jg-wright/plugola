import type { KafkaConsumer, KafkaProducer } from '../../src/index.ts'

/**
 * An in-memory stand-in for a Kafka cluster: each topic is an append-only log,
 * and every running consumer subscribed to it is fed new records in order, one
 * at a time, each awaiting the previous `eachMessage` (as a real consumer does
 * within a partition). Delivery happens on a later macrotask, like a network hop.
 * A paused topic stops being fed after the current message, as in kafkajs.
 *
 * A record's offset is committed once `eachMessage` resolves. If it throws, the
 * record is retried on the next macrotask (kafkajs backs off, then restarts from
 * the last committed offset), so a handler that always throws retries forever.
 */
export class FakeKafka {
  readonly #logs = new Map<string, FakeRecord[]>()
  readonly #consumers = new Set<FakeConsumer>()

  producer(): FakeProducer {
    const kafka = this
    const producer: FakeProducer = {
      sent: [],
      async send(record) {
        await macrotask()
        if (producer.failNext) {
          const error = producer.failNext
          producer.failNext = undefined
          throw error
        }
        producer.sent.push(record)
        kafka.#append(record.topic, record.messages)
      },
    }
    return producer
  }

  consumer(): FakeConsumer {
    const kafka = this
    const consumer: FakeConsumer = {
      topics: [],
      offsets: new Map(),
      paused: new Set(),
      failures: [],
      heartbeats: 0,
      async subscribe({ topics, fromBeginning }) {
        for (const topic of topics) {
          consumer.topics.push(topic)
          consumer.offsets.set(
            topic,
            fromBeginning ? 0 : (kafka.#logs.get(topic)?.length ?? 0),
          )
        }
      },
      async run({ eachMessage }) {
        consumer.eachMessage = eachMessage
        kafka.#consumers.add(consumer)
        kafka.#feedAll()
      },
      pause(topics) {
        if (!consumer.eachMessage) throw new Error('run must be called first')
        for (const { topic } of topics) consumer.paused.add(topic)
      },
      resume(topics) {
        if (!consumer.eachMessage) throw new Error('run must be called first')
        for (const { topic } of topics) consumer.paused.delete(topic)
        kafka.#feed(consumer)
      },
    }
    return consumer
  }

  /** Writes raw records to `topic`, as some other producer might. */
  publish(topic: string, ...values: (string | null)[]) {
    this.#append(
      topic,
      values.map((value) => ({ key: null, value })),
    )
  }

  #append(topic: string, records: FakeRecord[]) {
    const log = this.#logs.get(topic) ?? []
    log.push(...records)
    this.#logs.set(topic, log)
    this.#feedAll()
  }

  #feedAll() {
    for (const consumer of this.#consumers) this.#feed(consumer)
  }

  /** Delivers each topic's unread records to `consumer`, serially. */
  #feed(consumer: FakeConsumer) {
    consumer.delivering = (consumer.delivering ?? Promise.resolve()).then(
      async () => {
        await macrotask()
        for (const topic of consumer.topics) {
          const log = this.#logs.get(topic) ?? []
          let offset = consumer.offsets.get(topic) ?? 0
          while (offset < log.length && !consumer.paused.has(topic)) {
            const { value } = log[offset]!
            try {
              await consumer.eachMessage!({
                message: {
                  value: value === null ? null : encoder.encode(value),
                },
                heartbeat: async () => {
                  consumer.heartbeats++
                },
              })
              consumer.offsets.set(topic, ++offset)
            } catch (error) {
              consumer.failures.push(error)
              await macrotask()
            }
          }
        }
      },
    )
  }
}

export interface FakeProducer extends KafkaProducer {
  /** Every record the producer accepted, in order. */
  sent: Parameters<KafkaProducer['send']>[0][]
  /** Set to make the next `send` reject with this error. */
  failNext?: Error
}

export interface FakeConsumer extends KafkaConsumer {
  topics: string[]
  offsets: Map<string, number>
  paused: Set<string>
  /** Everything `eachMessage` threw, in order; each failed record was retried. */
  failures: unknown[]
  heartbeats: number
  eachMessage?: Parameters<KafkaConsumer['run']>[0]['eachMessage']
  delivering?: Promise<void>
}

interface FakeRecord {
  key: string | null
  value: string | null
}

function macrotask() {
  return new Promise<void>((resolve) => setTimeout(resolve))
}

const encoder = new TextEncoder()
