import { beforeEach, expect, test, vi } from 'vitest'
import {
  markFromWire,
  MessageBus,
  NoResponderError,
  TransportableMessageRegistry,
} from '@plugola/message-bus'
import {
  KafkaCommandDecodeError,
  KafkaCommandError,
  KafkaCommandSink,
  KafkaCommandSource,
  type KafkaCommandSinkOptions,
  type KafkaCommandSourceOptions,
} from '../src/index.ts'
import { FakeKafka } from './fixtures/FakeKafka.ts'

let kafka: FakeKafka
let onError: ReturnType<typeof vi.fn<(error: unknown) => void>>

beforeEach(() => {
  kafka = new FakeKafka()
  onError = vi.fn()
})

test('a command invoked on one bus is handled on another, through the topic', async () => {
  const producing = sinkBus()
  const consuming = sourceBus()
  const handled = vi.fn()
  consuming.app.register(processOrder, handled)
  await consuming.source.start()

  await producing.app.invoke(processOrder({ orderId: 'o1' })).collect()

  await vi.waitFor(() =>
    expect(consuming.consumer.offsets.get('orders')).toBe(1),
  )
  expect(handled).toHaveBeenCalledWith(
    expect.objectContaining({ orderId: 'o1' }),
    expect.anything(),
  )
  expect(onError).not.toHaveBeenCalled()
})

test('the sink publishes a record per invoke, resolving once the broker accepts it', async () => {
  const { app, producer } = sinkBus()

  expect(await app.invoke(processOrder({ orderId: 'o1' })).collect()).toEqual(
    [],
  )

  expect(producer.sent).toMatchInlineSnapshot(`
    [
      {
        "messages": [
          {
            "key": "orders",
            "value": "{"name":"process-order","payload":{"orderId":"o1"}}",
          },
        ],
        "topic": "orders",
      },
    ]
  `)
})

test('the sink rejects the invoke when the producer fails', async () => {
  const { app, producer } = sinkBus()
  producer.failNext = new Error('broker down')

  await expect(
    app.invoke(processOrder({ orderId: 'o1' })).collect(),
  ).rejects.toThrow('broker down')
})

test('a custom key picks each record’s partition key', async () => {
  const { app, producer } = sinkBus({ key: (command) => command.orderId })

  await app.invoke(processOrder({ orderId: 'o1' })).collect()

  expect(producer.sent[0]!.messages[0]!.key).toBe('o1')
})

test('the sink does not publish a command from the wire, nor count as its responder', async () => {
  const { app, producer } = sinkBus()
  const fromWire = markFromWire(processOrder({ orderId: 'o1' }))

  await expect(
    app.invoke(fromWire, { requireResponder: true }).collect(),
  ).rejects.toThrow(NoResponderError)
  expect(producer.sent).toEqual([])
})

test('a record is committed only once its responders have succeeded', async () => {
  const { app, consumer, source } = sourceBus()
  const { promise: finished, resolve: finish } = Promise.withResolvers<void>()
  const handled = vi.fn(() => finished)
  app.register(processOrder, handled)
  await source.start()

  kafka.publish('orders', record('o1'))
  await vi.waitFor(() => expect(handled).toHaveBeenCalled())
  expect(consumer.offsets.get('orders')).toBe(0)

  finish()
  await vi.waitFor(() => expect(consumer.offsets.get('orders')).toBe(1))
})

test('a failing responder leaves its record uncommitted, and it is retried', async () => {
  const { app, consumer, source } = sourceBus()
  const boom = new Error('boom')
  const handled = vi
    .fn()
    .mockRejectedValueOnce(boom)
    .mockResolvedValue(undefined)
  app.register(processOrder, handled)
  await source.start()

  kafka.publish('orders', record('o1'))
  await vi.waitFor(() => expect(consumer.offsets.get('orders')).toBe(1))

  expect(handled).toHaveBeenCalledTimes(2)
  const [[error]] = onError.mock.calls as [[KafkaCommandError]]
  expect(error).toBeInstanceOf(KafkaCommandError)
  expect(error.errors).toEqual([boom])
  expect(consumer.failures).toEqual([error])
})

test('a record nobody handles is retried until a responder is registered', async () => {
  const { app, consumer, source } = sourceBus()
  await source.start()

  kafka.publish('orders', record('o1'))
  await vi.waitFor(() =>
    expect(onError).toHaveBeenCalledWith(expect.any(NoResponderError)),
  )
  expect(consumer.offsets.get('orders')).toBe(0)

  const handled = vi.fn()
  app.register(processOrder, handled)
  await vi.waitFor(() => expect(consumer.offsets.get('orders')).toBe(1))
  expect(handled).toHaveBeenCalledOnce()
})

test('a record that is not a known command is reported and committed', async () => {
  const { app, consumer, source } = sourceBus()
  const handled = vi.fn()
  app.register(processOrder, handled)
  await source.start()

  kafka.publish(
    'orders',
    'not json',
    JSON.stringify({ name: 'unknown', payload: {} }),
    JSON.stringify({ payload: {} }),
    null,
    record('o1'),
  )
  await vi.waitFor(() => expect(consumer.offsets.get('orders')).toBe(5))

  expect(onError.mock.calls.map(([error]) => error)).toEqual([
    expect.any(KafkaCommandDecodeError),
    expect.any(KafkaCommandDecodeError),
    expect.any(KafkaCommandDecodeError),
    expect.any(KafkaCommandDecodeError),
  ])
  expect(handled).toHaveBeenCalledOnce()
})

test('aborting the source aborts the command in hand, leaves it uncommitted, and pauses', async () => {
  const { app, consumer, source } = sourceBus()
  let signal: AbortSignal | undefined
  app.register(processOrder, (_command, context) => {
    signal = context.signal
    return new Promise<void>(() => {}) // never finishes on its own
  })
  await source.start()

  kafka.publish('orders', record('o1'), record('o2'))
  await vi.waitFor(() => expect(signal).toBeDefined())
  source.abort()
  await settled()

  expect(signal!.aborted).toBe(true)
  expect(consumer.paused).toEqual(new Set(['orders']))
  expect(consumer.offsets.get('orders')).toBe(0)
  expect(onError).not.toHaveBeenCalled()
})

test('the source heartbeats while a slow command is handled', async () => {
  const { app, consumer, source } = sourceBus({ heartbeatInterval: 5 })
  app.register(processOrder, () => new Promise((r) => setTimeout(r, 40)))
  await source.start()

  kafka.publish('orders', record('o1'))
  await vi.waitFor(() => expect(consumer.offsets.get('orders')).toBe(1))

  expect(consumer.heartbeats).toBeGreaterThanOrEqual(3)
})

test('start passes fromBeginning and partitionsConsumedConcurrently when set', async () => {
  const consumer = kafka.consumer()
  const subscribe = vi.spyOn(consumer, 'subscribe')
  const run = vi.spyOn(consumer, 'run')
  const { source } = sourceBus({
    consumer,
    fromBeginning: true,
    partitionsConsumedConcurrently: 3,
  })

  await source.start()

  expect(subscribe.mock.calls).toEqual([
    [{ topics: ['orders'], fromBeginning: true }],
  ])
  expect(run.mock.calls[0]![0]).toMatchObject({
    partitionsConsumedConcurrently: 3,
  })
})

const registry = TransportableMessageRegistry.create()
  .command('process-order')
  .as<{ orderId: string }, void>()
const processOrder = registry.commands['process-order']

function sinkBus(options?: Partial<KafkaCommandSinkOptions>) {
  const bus = new MessageBus()
  const producer = kafka.producer()
  new KafkaCommandSink(bus, { producer, topic: 'orders', registry, ...options })
  const app = bus.gateway('app')
  bus.resume()
  return { app, producer }
}

function sourceBus(options?: Partial<KafkaCommandSourceOptions>) {
  const bus = new MessageBus()
  const consumer = kafka.consumer()
  const source = new KafkaCommandSource(bus, {
    consumer,
    topic: 'orders',
    registry,
    onError,
    ...options,
  })
  const app = bus.gateway('app')
  bus.resume()
  return { app, consumer, source }
}

/** A record as a {@link KafkaCommandSink} would write it. */
function record(orderId: string) {
  return JSON.stringify({ name: 'process-order', payload: { orderId } })
}

/** Lets the fake broker's macrotask hops run out. */
async function settled() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r))
}
