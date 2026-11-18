import type { Frame } from '@plugola/message-bus'

/** The producer rejected a batch; `frames` were not sent. */
export class KafkaChannelSendError extends Error {
  constructor(
    public readonly frames: Frame[],
    options?: ErrorOptions,
  ) {
    super(`KafkaChannel failed to send ${frames.length} frame(s)`, options)
    this.name = 'KafkaChannelSendError'
  }
}

/** A Kafka message on the receive topic that isn't a JSON-encoded frame. */
export class KafkaChannelDecodeError extends Error {
  constructor(public readonly value: Uint8Array | string | null) {
    super('KafkaChannel received a message that is not a frame')
    this.name = 'KafkaChannelDecodeError'
  }
}
