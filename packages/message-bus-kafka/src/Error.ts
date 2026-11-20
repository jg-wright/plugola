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

/**
 * A record on a {@link KafkaCommandSource}'s topic that isn't a command in its
 * registry: not JSON, not a `{ name, payload }` record, an unknown command name,
 * or a payload the command's codec rejects (the `cause`).
 */
export class KafkaCommandDecodeError extends Error {
  constructor(
    public readonly value: Uint8Array | string | null,
    options?: ErrorOptions,
  ) {
    super(
      'KafkaCommandSource received a record that is not a known command',
      options,
    )
    this.name = 'KafkaCommandDecodeError'
  }
}

/**
 * One or more responders threw while handling a command from a
 * {@link KafkaCommandSource}'s topic, so its record is left uncommitted and
 * retried. `errors` holds what each responder threw.
 */
export class KafkaCommandError extends AggregateError {
  constructor(
    public readonly command: { $name: string },
    errors: unknown[],
  ) {
    super(
      errors,
      `Command "${command.$name}" failed in ${errors.length} responder(s)`,
    )
    this.name = 'KafkaCommandError'
  }
}
