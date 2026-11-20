/**
 * The part of a Kafka producer this package uses — satisfied by a `kafkajs`
 * `Producer` and by `@confluentinc/kafka-javascript`'s `KafkaJS.Producer`.
 */
export interface KafkaProducer {
  send(record: {
    topic: string
    messages: { key: string | null; value: string }[]
  }): Promise<unknown>
}

/**
 * The part of a Kafka consumer this package uses — satisfied by a `kafkajs`
 * `Consumer` and by `@confluentinc/kafka-javascript`'s `KafkaJS.Consumer`.
 */
export interface KafkaConsumer {
  subscribe(subscription: {
    topics: string[]
    fromBeginning?: boolean
  }): Promise<void>
  run(config: {
    partitionsConsumedConcurrently?: number
    /**
     * Handles one record. Resolving acknowledges it (its offset is committed);
     * throwing leaves it uncommitted, to be retried.
     */
    eachMessage(payload: KafkaEachMessagePayload): Promise<void>
  }): Promise<void>
  /** Stops fetching from `topics`; only valid once `run` has resolved. */
  pause(topics: { topic: string }[]): void
  /** Resumes fetching from paused `topics`; only valid once `run` has resolved. */
  resume(topics: { topic: string }[]): void
}

/** What a consumer hands `eachMessage` for each record. */
export interface KafkaEachMessagePayload {
  partition: number
  message: { offset: string; value: Uint8Array | string | null }
  /**
   * Tells the group this consumer is still alive. kafkajs needs one within its
   * `sessionTimeout` during long processing, or it rebalances the partition away.
   */
  heartbeat(): Promise<void>
}
