# @plugola/message-bus-kafka

A Kafka [`Channel`](../message-bus/README.md#transports-bridging-buses) for
`@plugola/message-bus`: bridge two `MessageBus`es in separate services over a
pair of Kafka topics, with messages and commands (including streamed responses,
cancellation and errors) relayed by a `MessagingBridge`. Or use a topic as a
durable work queue of commands, committed only once handled
([Durable commands](#durable-commands)).

```sh
npm install @plugola/message-bus @plugola/message-bus-kafka
```

## Usage

The channel takes a producer and a consumer you create and connect yourself. It
types them structurally, so they can come from
[`kafkajs`](https://kafka.js.org/) or from the KafkaJS-compatible API of
[`@confluentinc/kafka-javascript`](https://github.com/confluentinc/confluent-kafka-javascript).

Each side sends on one topic and receives on the other, so the two topics make
up the duplex pipe the bridge needs:

```typescript
import { MessageBus, MessagingBridge } from '@plugola/message-bus'
import { KafkaChannel } from '@plugola/message-bus-kafka'
import { Kafka } from 'kafkajs'
import { registry } from './contract.ts' // shared by both services

const kafka = new Kafka({ brokers: ['localhost:9092'] })
const producer = kafka.producer()
const consumer = kafka.consumer({ groupId: 'web' })
await Promise.all([producer.connect(), consumer.connect()])

const channel = new KafkaChannel({
  producer,
  consumer,
  topics: { send: 'web-to-billing', receive: 'billing-to-web' },
  onError: (error) => console.error(error),
})

const bus = new MessageBus()
new MessagingBridge(bus, channel, registry)
```

The billing service does the same with the topics swapped:
`{ send: 'billing-to-web', receive: 'web-to-billing' }`.

To shut down, abort the bridge, then `await channel.flush()` before
disconnecting the producer so no queued frame is lost. Once the bridge is
aborted the consumer is paused, so frames that arrive before it disconnects are
left uncommitted for the group's next consumer.

## Behaviour

- **Lazy consumption.** The consumer is subscribed and run when the bridge
  first registers to receive, so nothing is consumed (and no offset committed)
  before there is a handler. Likewise the consumer is paused whenever every
  handler has been disposed (e.g. the bridge was aborted), and resumed when one
  is registered again. Give each channel its own consumer, because a consumer
  can only be run once.
- **Batching and order.** `send` queues the frame. Frames queued in the same
  task go to the producer as one batch, and the next batch waits for the
  previous one. By default every frame is keyed with the send topic's name, so
  all frames share a partition and arrive in the order they were sent. Pass
  `key: (frame) => …` to spread them across partitions instead. Frames with
  different keys are then no longer ordered relative to each other.
- **Where to start reading.** A consumer group with no committed offset starts
  at the end of the topic by default, so it misses frames produced before it
  joined. Set `fromBeginning: true` (kafkajs), or `fromBeginning` in the
  consumer config (Confluent), if that matters.
- **Errors.** The channel reports every asynchronous failure to `onError`:
  - a batch the producer rejected, as a `KafkaChannelSendError` whose `frames`
    were not sent and are not retried;
  - a record that isn't a frame, as a `KafkaChannelDecodeError`;
  - a receive handler that throws;
  - a consumer that fails to subscribe, run, pause or resume.

  A throwing handler doesn't fail the Kafka message, so a bad frame can't stall
  the partition. If a command frame is lost, the caller's `invoke` waits until
  it is aborted, so give important invokes a timeout signal.

## Delivery guarantees

Kafka acknowledges each hop separately, and the channel relies on each
client's own settings for that rather than adding acks of its own.

- **Sending.** A batch counts as sent once the producer's `send` resolves,
  meaning the broker has acknowledged it according to the producer's `acks`
  setting. kafkajs defaults to all in-sync replicas. A batch that is still
  rejected after the client's own retries is reported as a
  `KafkaChannelSendError`. The channel does not retry it. Those retries can
  write a batch twice unless the producer is idempotent, so consider
  `kafka.producer({ idempotent: true })` (kafkajs) or
  `{ kafkaJS: { idempotent: true } }` (Confluent).
- **Receiving.** A frame is acknowledged (its offset resolved, then committed
  by the consumer's auto-commit) as soon as it has been **handed to the
  bridge**, not when the bus has finished handling it. A command whose
  responder is still running when the process dies is not redelivered.
  Its caller sees the command go unanswered.
- **Redelivery.** A frame handed over but not yet committed when the process
  crashes or the group rebalances is delivered again, so receivers can see
  duplicates. The bridge ignores a duplicate command while the original is
  still running. It can't recognise one after that, or after a restart.
  Duplicate one-way messages are delivered again too, so make their handlers
  idempotent where it matters.
- **Bad frames** (undecodable, or a throwing handler) are acknowledged and
  reported to `onError` rather than retried, so they can't stall the partition.
  To dead-letter them, publish `KafkaChannelDecodeError.value` from `onError`.

End to end, a command's `response-end` or `response-error` is its
acknowledgement: an `invoke` that resolves was handled. A one-way message has no
end-to-end acknowledgement.

## Topology

This is a **point-to-point** channel: one bridge on each side of a topic pair.
If several instances share a consumer group on the receive topic, a command's
responses may reach an instance that didn't send the command, and are dropped
there.

### Bridging to several topics

To send different messages to different topics, give one bus a bridge per topic
pair, each with a registry listing what it carries. The registry is the routing
table: a bridge relays exactly the factories it was given. A factory can be in
several registries, in which case it goes to each of their topics:

```typescript
import { OrderPlaced, Login } from './messages.ts'

const orders = TransportableMessageRegistry.create().addMessage(OrderPlaced)
const audit = TransportableMessageRegistry.create()
  .addMessage(OrderPlaced)
  .addMessage(Login)

new MessagingBridge(bus, ordersChannel, orders, { name: 'orders-bridge' })
new MessagingBridge(bus, auditChannel, audit, { name: 'audit-bridge' })
```

Every bridge needs its own `name` because each joins the bus as a participant.
Because a message that arrived from the wire is never relayed again, one bus
can bridge to many topics without echoes.

## Durable commands

The channel relays traffic between two live buses. To use a topic as a durable
work queue instead, use a `KafkaCommandSink` on the producing side and a
`KafkaCommandSource` on the consuming side. A record is committed only once its
command has been handled successfully, and a failure leaves it to be retried.

Both sides share a registry of the commands the topic carries. Responses can't
travel back over the topic, so give these commands a `void` response type:

```typescript
// contract.ts
export const orders = TransportableMessageRegistry.create()
  .command('process-order')
  .as<{ orderId: string }, void>()
export const processOrder = orders.commands['process-order']
```

**Producing.** The sink registers as the responder for every command in the
registry and publishes each invoke as one record. The invoke resolves once the
broker has acknowledged the record and rejects if the producer fails, so a
resolved invoke means the work is durably queued:

```typescript
new KafkaCommandSink(bus, {
  producer,
  topic: 'orders',
  registry: orders,
  key: (command) => command.orderId, // per-order ordering, spread over partitions
})

await app.invoke(processOrder({ orderId: 'o1' })).collect()
```

**Consuming.** The source invokes each record's command on its bus and waits
for every responder to settle:

```typescript
const source = new KafkaCommandSource(bus, {
  consumer,
  topic: 'orders',
  registry: orders,
  onError: (error) => logger.warn(error),
})
app.register(processOrder, async (command) => {
  await saveOrder(command)
})
await source.start()
```

| Outcome                                                                 | Record                                                          | `onError` gets            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| Every responder that ran resolved                                       | committed                                                       | nothing                   |
| A responder threw                                                       | retried (dead-lettered after `maxAttempts`, if set)             | `KafkaCommandError`       |
| No responder ran (none registered, all paused, or none matched filters) | retried (dead-lettered after `maxAttempts`, if set)             | `NoResponderError`        |
| Not JSON, or not a command in the registry                              | committed (or dead-lettered), so it can't hold up the partition | `KafkaCommandDecodeError` |
| The source was aborted mid-command                                      | left uncommitted for the group's next consumer; consumer paused | nothing                   |

Retrying is the consumer's own behaviour: kafkajs retries per its `retry`
config, then restarts from the last committed offset. A failing record holds
up its whole partition until it succeeds, which keeps records in order. That
includes other entities whose keys hash to the same partition. Keying by
entity spreads the work so that a failure holds up only a share of it, and
`partitionsConsumedConcurrently` handles partitions in parallel.

### Dead letters

To stop a record that keeps failing from holding up its partition, give the
source a `deadLetter`. Once a record's command has failed `maxAttempts` times,
the record is passed to `publish`, then committed once that resolves. If
`publish` throws, the record is retried, command first. Undecodable records go
straight to `publish` instead of being dropped, which keeps a record from a
newer producer for later:

```typescript
new KafkaCommandSource(bus, {
  consumer,
  topic: 'orders',
  registry: orders,
  onError: (error) => logger.warn(error),
  deadLetter: {
    maxAttempts: 5,
    publish: async ({ value, offset, error }) => {
      await producer.send({
        topic: 'orders.dlq',
        messages: [
          {
            value: value && Buffer.from(value),
            headers: { offset, error: String(error) },
          },
        ],
      })
    },
  },
})
```

The letter carries the record's `topic`, `partition`, `offset` and raw `value`,
the decoded `command` (when there is one), the last `error`, and how many
`attempts` failed. Attempts are counted in memory, so they start again after a
restart or rebalance: a record can get more attempts than `maxAttempts`, never
fewer.

Dead-lettering a record lets later records with the same key go ahead without
it. Only use it where that's acceptable.

A responder can also dead-letter a command itself when it knows a failure is
permanent: catch the error, invoke a command routed to a dead-letter
`KafkaCommandSink`, and return.

A record can be handled more than once (after a crash, a rebalance, or a
failure in a sibling responder), so make responders idempotent. While a
command is running the source heartbeats every `heartbeatInterval` ms (3000 by
default), so slow work doesn't get the partition rebalanced away.

Commands the source invokes are marked as coming from the wire, so a sink or
bridge on the same bus doesn't publish them again.

## Testing

The unit tests run against an in-memory fake broker. An end-to-end test against
a real broker runs when `KAFKA_BROKERS` is set:

```sh
docker run -d --rm -p 9092:9092 apache/kafka:4.2.0
KAFKA_BROKERS=localhost:9092 npm test --workspace @plugola/message-bus-kafka
```
