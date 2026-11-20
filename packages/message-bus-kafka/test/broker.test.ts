import { expect, test } from 'vitest'
import {
  MessageBus,
  MessagingBridge,
  TransportableMessageRegistry,
} from '@plugola/message-bus'
import { Kafka, logLevel, Partitioners } from 'kafkajs'
import {
  KafkaChannel,
  KafkaCommandError,
  KafkaCommandSink,
  KafkaCommandSource,
} from '../src/index.ts'

// End-to-end over a real Kafka broker, so it only runs when one is given:
//   KAFKA_BROKERS=localhost:9092 npm test
// CI provides one as a service container.
const brokers = process.env.KAFKA_BROKERS?.split(',')

test.skipIf(!brokers)(
  'bridges messages and commands between two buses over a real broker',
  async () => {
    await using kafka = await useTopicPair(brokers!)

    const registry = TransportableMessageRegistry.create()
      .message('clicked')
      .as<{ x: number }>()
      .command('sum')
      .as<{ a: number; b: number }, number>()
    const { clicked } = registry.messages
    const { sum } = registry.commands

    const web = await kafka.bridgedBus(registry, 'web', {
      send: kafka.topics[0],
      receive: kafka.topics[1],
    })
    const api = await kafka.bridgedBus(registry, 'api', {
      send: kafka.topics[1],
      receive: kafka.topics[0],
    })

    const heard = api.until(clicked)
    api.register(sum, ({ a, b }, { send }) => {
      send(a + b)
      send(a * b)
    })

    web.emit(clicked({ x: 1 }))
    expect((await heard).x).toBe(1)
    expect(await web.invoke(sum({ a: 2, b: 3 })).collect()).toEqual([5, 6])
    expect(kafka.errors).toEqual([])
  },
  60_000,
)

test.skipIf(!brokers)(
  'publishes commands through a real broker, retrying one that fails',
  async () => {
    await using kafka = await useTopicPair(brokers!)

    const registry = TransportableMessageRegistry.create()
      .command('process-order')
      .as<{ orderId: string }, void>()
    const processOrder = registry.commands['process-order']

    const producing = await kafka.sinkBus(registry, kafka.topics[0])
    const consuming = await kafka.sourceBus(registry, kafka.topics[0])

    const attempts: string[] = []
    const { promise: handled, resolve } = Promise.withResolvers<void>()
    consuming.gateway.register(processOrder, ({ orderId }) => {
      attempts.push(orderId)
      if (attempts.length === 1) throw new Error('transient failure')
      resolve()
    })
    await consuming.source.start()

    await producing.invoke(processOrder({ orderId: 'o1' })).collect()
    await handled

    expect(attempts).toEqual(['o1', 'o1'])
    expect(kafka.errors).toEqual([expect.any(KafkaCommandError)])
  },
  60_000,
)

/**
 * Creates two fresh single-partition topics and hands out bridged buses wired to
 * them; disposing disconnects every client and deletes the topics.
 */
async function useTopicPair(brokers: string[]) {
  const disposable = new AsyncDisposableStack()
  const kafka = new Kafka({
    brokers,
    clientId: 'message-bus-kafka-test',
    logLevel: logLevel.NOTHING,
  })
  const id = crypto.randomUUID()
  const topics = [`mbk-${id}-a`, `mbk-${id}-b`] as const

  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({
    waitForLeaders: true,
    topics: topics.map((topic) => ({ topic, numPartitions: 1 })),
  })
  disposable.defer(async () => {
    await admin.deleteTopics({ topics: [...topics] })
    await admin.disconnect()
  })

  const errors: unknown[] = []

  return {
    topics,
    errors,

    async bridgedBus(
      registry: TransportableMessageRegistry,
      name: string,
      channelTopics: { send: string; receive: string },
    ) {
      const producer = kafka.producer({
        createPartitioner: Partitioners.DefaultPartitioner,
      })

      const consumer = kafka.consumer({ groupId: `mbk-${id}-${name}` })

      await Promise.all([producer.connect(), consumer.connect()])
      disposable.defer(async () => {
        await Promise.all([producer.disconnect(), consumer.disconnect()])
      })

      const channel = disposable.adopt(
        new KafkaChannel({
          producer,
          consumer,
          topics: channelTopics,
          // The topics are new, so read them from the start: frames produced
          // before this consumer joins its group are not missed.
          fromBeginning: true,
          onError: (error) => errors.push(error),
        }),
        (channel) => channel.flush(),
      )

      const bus = new MessageBus()
      new MessagingBridge(bus, channel, registry)
      const gateway = bus.gateway('app')
      bus.resume()
      return gateway
    },

    /** A bus whose commands in `registry` are published to `topic`. */
    async sinkBus(registry: TransportableMessageRegistry, topic: string) {
      const producer = kafka.producer({
        createPartitioner: Partitioners.DefaultPartitioner,
      })
      await producer.connect()
      disposable.defer(() => producer.disconnect())

      const bus = new MessageBus()
      new KafkaCommandSink(bus, { producer, topic, registry })
      const gateway = bus.gateway('app')
      bus.resume()
      return gateway
    },

    /** A bus that handles the commands in `registry` from `topic`, once started. */
    async sourceBus(registry: TransportableMessageRegistry, topic: string) {
      const consumer = kafka.consumer({
        groupId: `mbk-${id}-source`,
        retry: { initialRetryTime: 100 },
      })
      await consumer.connect()
      disposable.defer(() => consumer.disconnect())

      const bus = new MessageBus()
      const source = new KafkaCommandSource(bus, {
        consumer,
        topic,
        registry,
        fromBeginning: true,
        onError: (error) => errors.push(error),
      })
      const gateway = bus.gateway('app')
      bus.resume()
      return { gateway, source }
    },

    [Symbol.asyncDispose]: () => disposable.disposeAsync(),
  }
}
