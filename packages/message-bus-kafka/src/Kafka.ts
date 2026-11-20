/**
 * The part of a Kafka producer the channel uses — satisfied by a `kafkajs`
 * `Producer` and by `@confluentinc/kafka-javascript`'s `KafkaJS.Producer`.
 */
export interface KafkaProducer {
  send(record: {
    topic: string
    messages: { key: string | null; value: string }[]
  }): Promise<unknown>
}

/**
 * The part of a Kafka consumer the channel uses — satisfied by a `kafkajs`
 * `Consumer` and by `@confluentinc/kafka-javascript`'s `KafkaJS.Consumer`.
 */
export interface KafkaConsumer {
  subscribe(subscription: {
    topics: string[]
    fromBeginning?: boolean
  }): Promise<void>
  run(config: {
    eachMessage(payload: {
      message: { value: Uint8Array | string | null }
    }): Promise<void>
  }): Promise<void>
  /** Stops fetching from `topics`; only valid once `run` has resolved. */
  pause(topics: { topic: string }[]): void
  /** Resumes fetching from paused `topics`; only valid once `run` has resolved. */
  resume(topics: { topic: string }[]): void
}
