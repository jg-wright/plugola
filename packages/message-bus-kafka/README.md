# @plugola/message-bus-kafka

A Kafka [`Channel`](../message-bus/README.md#transports-bridging-buses) for
`@plugola/message-bus`: bridge two `MessageBus`es in separate services over a
pair of Kafka topics, with messages and commands (including streamed responses,
cancellation and errors) relayed by a `MessagingBridge`.

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
disconnecting the producer so no queued frame is lost.

## Behaviour

- **Lazy consumption.** The consumer is subscribed and run when the bridge
  first registers to receive, so nothing is consumed (and no offset committed)
  before there is a handler. Give each channel its own consumer, because a
  consumer can only be run once.
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
  - a consumer that fails to subscribe or run.

  A throwing handler doesn't fail the Kafka message, so a bad frame can't stall
  the partition. If a command frame is lost, the caller's `invoke` waits until
  it is aborted, so give important invokes a timeout signal.

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

## Testing

The unit tests run against an in-memory fake broker. An end-to-end test against
a real broker runs when `KAFKA_BROKERS` is set:

```sh
docker run -d --rm -p 9092:9092 apache/kafka:4.2.0
KAFKA_BROKERS=localhost:9092 npm test --workspace @plugola/message-bus-kafka
```
