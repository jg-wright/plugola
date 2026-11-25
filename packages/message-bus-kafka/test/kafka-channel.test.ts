import { beforeEach, expect, test, vi } from 'vitest'
import {
  MessageBus,
  MessagingBridge,
  TransportableMessageRegistry,
  type Frame,
} from '@plugola/message-bus'
import {
  KafkaChannel,
  KafkaChannelDecodeError,
  KafkaChannelSendError,
  type KafkaChannelOptions,
} from '../src/index.ts'
import {
  FakeKafka,
  type FakeConsumer,
  type FakeProducer,
} from './fixtures/FakeKafka.ts'

let kafka: FakeKafka
let onError: ReturnType<typeof vi.fn<(error: unknown) => void>>

beforeEach(() => {
  kafka = new FakeKafka()
  onError = vi.fn()
})

test('bridges messages and commands between two buses over a pair of topics', async () => {
  const registry = TransportableMessageRegistry.create()
    .message('clicked')
    .as<{ x: number }>()
    .command('sum')
    .as<{ a: number; b: number }, number>()
  const { clicked } = registry.messages
  const { sum } = registry.commands

  const web = bridgedBus(registry, {
    send: 'web-to-api',
    receive: 'api-to-web',
  })
  const api = bridgedBus(registry, {
    send: 'api-to-web',
    receive: 'web-to-api',
  })

  const heard = vi.fn()
  api.gateway.on(clicked, heard)
  api.gateway.register(sum, ({ a, b }, { send }) => {
    send(a + b)
    send(a * b)
  })

  web.gateway.emit(clicked({ x: 1 }))
  const results = await web.gateway.invoke(sum({ a: 2, b: 3 })).collect()

  expect(heard).toHaveBeenCalledWith(expect.objectContaining({ x: 1 }))
  expect(results).toEqual([5, 6])
  expect(onError).not.toHaveBeenCalled()
})

test('one bus can bridge to several topics, each carrying its registry’s messages', async () => {
  // Routing is by registry: each bridge relays only the factories it was given.
  const orders = TransportableMessageRegistry.create()
    .message('order-placed')
    .as<{ id: string }>()
  const audit = TransportableMessageRegistry.create()
    .addMessage(orders.messages['order-placed'])
    .message('login')
    .as<{ user: string }>()

  const bus = new MessageBus()
  new MessagingBridge(
    bus,
    channel({ topics: { send: 'orders', receive: 'orders-in' } }),
    orders,
    { name: 'orders-bridge' },
  )
  new MessagingBridge(
    bus,
    channel({ topics: { send: 'audit', receive: 'audit-in' } }),
    audit,
    { name: 'audit-bridge' },
  )
  const app = bus.gateway('app')
  bus.resume()

  const ordersTopic = consumeRaw('orders')
  const auditTopic = consumeRaw('audit')

  app.emit(orders.messages['order-placed']({ id: 'o1' }))
  app.emit(audit.messages.login({ user: 'u1' }))
  await settled()

  expect(ordersTopic.map((frame) => frame.kind === 'message' && frame.name))
    .toMatchInlineSnapshot(`
      [
        "order-placed",
      ]
    `)
  expect(auditTopic.map((frame) => frame.kind === 'message' && frame.name))
    .toMatchInlineSnapshot(`
      [
        "order-placed",
        "login",
      ]
    `)
})

test('frames sent in the same task go out as one batch, keyed by the send topic', async () => {
  const producer = kafka.producer()
  const ch = channel({ producer })

  ch.send(frame('a'))
  ch.send(frame('b'))
  await ch.flush()

  expect(producer.sent).toMatchInlineSnapshot(`
    [
      {
        "messages": [
          {
            "key": "out",
            "value": "{"kind":"message","name":"a","payload":{}}",
          },
          {
            "key": "out",
            "value": "{"kind":"message","name":"b","payload":{}}",
          },
        ],
        "topic": "out",
      },
    ]
  `)
})

test('frames sent while a batch is in flight wait for it, then go out together', async () => {
  const producer = kafka.producer()
  const send = vi.spyOn(producer, 'send')
  const ch = channel({ producer })

  ch.send(frame('a'))
  await Promise.resolve()
  await Promise.resolve()
  expect(send).toHaveBeenCalledTimes(1)

  ch.send(frame('b'))
  ch.send(frame('c'))
  expect(send).toHaveBeenCalledTimes(1)

  await ch.flush()
  expect(names(producer)).toEqual([['a'], ['b', 'c']])
})

test('a custom key picks each frame’s partition key', async () => {
  const producer = kafka.producer()
  const ch = channel({
    producer,
    key: (frame) => ('correlationId' in frame ? frame.correlationId : null),
  })

  ch.send(frame('a'))
  ch.send({ kind: 'response-end', correlationId: 'c1' })
  await ch.flush()

  expect(producer.sent[0]!.messages.map((m) => m.key)).toEqual([null, 'c1'])
})

test('a rejected batch is reported with its frames, and later frames still go out', async () => {
  const producer = kafka.producer()
  const cause = new Error('broker down')
  producer.failNext = cause
  const ch = channel({ producer })

  ch.send(frame('lost'))
  await ch.flush()
  ch.send(frame('kept'))
  await ch.flush()

  const [[error]] = onError.mock.calls as [[KafkaChannelSendError]]
  expect(error).toBeInstanceOf(KafkaChannelSendError)
  expect(error.cause).toBe(cause)
  expect(error.frames).toEqual([frame('lost')])
  expect(names(producer)).toEqual([['kept']])
})

test('the consumer is not subscribed or run until the first handler is registered', async () => {
  const consumer = kafka.consumer()
  const subscribe = vi.spyOn(consumer, 'subscribe')
  const run = vi.spyOn(consumer, 'run')
  const ch = channel({ consumer })
  await settled()
  expect(subscribe).not.toHaveBeenCalled()

  ch.receive(() => {})
  ch.receive(() => {})
  await settled()

  expect(subscribe.mock.calls).toEqual([[{ topics: ['in'] }]])
  expect(run).toHaveBeenCalledTimes(1)
})

test('fromBeginning is passed to subscribe only when set', async () => {
  const consumer = kafka.consumer()
  const subscribe = vi.spyOn(consumer, 'subscribe')
  channel({ consumer, fromBeginning: true }).receive(() => {})
  await settled()

  expect(subscribe.mock.calls).toEqual([
    [{ topics: ['in'], fromBeginning: true }],
  ])
})

test('inbound frames reach every handler until it is disposed', async () => {
  const ch = channel()
  const first = vi.fn()
  const second = vi.fn()
  const disposeFirst = ch.receive(first)
  ch.receive(second)
  await settled()

  kafka.publish('in', JSON.stringify(frame('a')))
  await settled()
  disposeFirst()
  kafka.publish('in', JSON.stringify(frame('b')))
  await settled()

  expect(first.mock.calls).toEqual([[frame('a')]])
  expect(second.mock.calls).toEqual([[frame('a')], [frame('b')]])
})

test('while no handler is registered the consumer is paused, so frames wait unconsumed', async () => {
  // e.g. between a bridge being aborted and its consumer disconnecting
  const consumer = kafka.consumer()
  const ch = channel({ consumer })
  ch.receive(() => {})()
  await settled()

  kafka.publish('in', JSON.stringify(frame('a')))
  await settled()
  expect(consumer.offsets.get('in')).toBe(0)

  const handler = vi.fn()
  ch.receive(handler)
  await settled()
  expect(handler.mock.calls).toEqual([[frame('a')]])
  expect(consumer.offsets.get('in')).toBe(1)
})

test('disposing the last handler mid-batch stops consumption after the current frame', async () => {
  const consumer = kafka.consumer()
  const ch = channel({ consumer })
  const handler = vi.fn(() => dispose())
  const dispose = ch.receive(handler)
  await settled()

  kafka.publish('in', JSON.stringify(frame('a')), JSON.stringify(frame('b')))
  await settled()

  expect(handler.mock.calls).toEqual([[frame('a')]])
  expect(consumer.offsets.get('in')).toBe(1)
})

test('a consumer that fails to pause is reported', async () => {
  const consumer = kafka.consumer()
  const failure = new Error('not assigned')
  vi.spyOn(consumer, 'pause').mockImplementation(() => {
    throw failure
  })
  const dispose = channel({ consumer }).receive(() => {})
  await settled()
  dispose()

  expect(onError.mock.calls).toEqual([[failure]])
})

test('a message that is not a frame is reported, and consumption carries on', async () => {
  const ch = channel()
  const handler = vi.fn()
  ch.receive(handler)
  await settled()

  kafka.publish('in', 'not json', '{"no":"kind"}', null)
  kafka.publish('in', JSON.stringify(frame('a')))
  await settled()

  expect(onError.mock.calls.map(([error]) => error)).toEqual([
    expect.any(KafkaChannelDecodeError),
    expect.any(KafkaChannelDecodeError),
    expect.any(KafkaChannelDecodeError),
  ])
  expect(handler.mock.calls).toEqual([[frame('a')]])
})

test('a throwing handler is reported without failing the Kafka message', async () => {
  const ch = channel()
  const boom = new Error('boom')
  const after = vi.fn()
  ch.receive(() => {
    throw boom
  })
  ch.receive(after)
  await settled()

  kafka.publish('in', JSON.stringify(frame('a')))
  await settled()

  expect(onError.mock.calls).toEqual([[boom]])
  expect(after).toHaveBeenCalledOnce()
})

test('a consumer that fails to start is reported', async () => {
  const consumer = kafka.consumer()
  const failure = new Error('no such topic')
  vi.spyOn(consumer, 'subscribe').mockRejectedValue(failure)
  channel({ consumer }).receive(() => {})
  await settled()

  expect(onError.mock.calls).toEqual([[failure]])
})

function channel(options: Partial<KafkaChannelOptions> = {}) {
  return new KafkaChannel({
    producer: kafka.producer(),
    consumer: kafka.consumer(),
    topics: { send: 'out', receive: 'in' },
    onError,
    ...options,
  })
}

function bridgedBus(
  registry: TransportableMessageRegistry,
  topics: KafkaChannelOptions['topics'],
) {
  const bus = new MessageBus()
  new MessagingBridge(bus, channel({ topics }), registry)
  const gateway = bus.gateway('app')
  bus.resume()
  return { bus, gateway }
}

/** Collects every frame written to `topic` from now on. */
function consumeRaw(topic: string) {
  const frames: Frame[] = []
  const consumer: FakeConsumer = kafka.consumer()
  void consumer.subscribe({ topics: [topic] }).then(() =>
    consumer.run({
      async eachMessage({ message }) {
        frames.push(
          JSON.parse(String(Buffer.from(message.value as Uint8Array))),
        )
      },
    }),
  )
  return frames
}

function frame(name: string): Frame {
  return { kind: 'message', name, payload: {} }
}

function names(producer: FakeProducer) {
  return producer.sent.map(({ messages }) =>
    messages.map(({ value }) => (JSON.parse(value) as { name: string }).name),
  )
}

/** Lets the fake broker's macrotask hops (and the channel's batches) run out. */
async function settled() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r))
}
