import type { KafkaConsumer, KafkaProducer } from '../../src/index.ts'

/**
 * An in-memory stand-in for a Kafka cluster: each topic is an append-only log,
 * and every running consumer subscribed to it is fed new records in order, one
 * at a time, each awaiting the previous `eachMessage` (as a real consumer does
 * within a partition). Delivery happens on a later macrotask, like a network hop.
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
          while (offset < log.length) {
            const { value } = log[offset++]!
            consumer.offsets.set(topic, offset)
            await consumer.eachMessage!({
              message: {
                value: value === null ? null : encoder.encode(value),
              },
            })
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
