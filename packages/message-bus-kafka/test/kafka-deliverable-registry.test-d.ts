// Type-level tests that a KafkaDeliverableRegistry admits only `void` commands.
// Checked with `tsc` (see `test:types`), not run — the exported `assert*`
// functions exist only so the compiler checks their bodies.

import { expectTypeOf } from 'vitest'
import {
  command,
  message,
  TransportableMessageRegistry,
  type MessageBus,
} from '@plugola/message-bus'
import {
  KafkaCommandSink,
  KafkaCommandSource,
  KafkaDeliverableRegistry,
  type KafkaConsumer,
  type KafkaProducer,
} from '../src/index.ts'

export function assertCommandsRespondWithVoid() {
  const registry = KafkaDeliverableRegistry.create()
    .command('process-order')
    .as<{ orderId: string }>()

  expectTypeOf(
    registry.commands['process-order']({ orderId: 'o1' }).$responseType,
  ).toEqualTypeOf<void>()

  // @ts-expect-error a command that responds can't be declared
  registry.command('get-order').as<{ orderId: string }, string>()
}

export function assertAddCommandTakesOnlyVoidFactories() {
  const registry = KafkaDeliverableRegistry.create()

  const added = registry.addCommand(
    command<{ orderId: string }, void, 'cancel-order'>('cancel-order'),
  )
  expectTypeOf(added).toExtend<KafkaDeliverableRegistry>()
  expectTypeOf(added.commands).toHaveProperty('cancel-order')

  // @ts-expect-error a factory that responds with a value
  registry.addCommand(command<{ orderId: string }, string>('get-order'))
  // @ts-expect-error no response type given, so it responds with `unknown`
  registry.addCommand(command<{ orderId: string }>('archive-order'))
}

export function assertChainsStayDeliverable() {
  const registry = KafkaDeliverableRegistry.create()
    .command('a')
    .as<{}>()
    .addCommand(command<{}, void, 'b'>('b'))
    .command('c')
    .as<{}>()

  expectTypeOf(registry).toExtend<KafkaDeliverableRegistry>()
  expectTypeOf(registry.commands).toHaveProperty('a')
  expectTypeOf(registry.commands).toHaveProperty('b')
  expectTypeOf(registry.commands).toHaveProperty('c')

  // @ts-expect-error the limit holds further down the chain
  registry.command('d').as<{}, number>()
}

export function assertNoMessages() {
  const registry = KafkaDeliverableRegistry.create()

  // @ts-expect-error messages can't be declared
  registry.message('order-placed')
  // @ts-expect-error nor added
  registry.addMessage(message<{ orderId: string }>('order-placed'))
}

export function assertSinkAndSourceTakeOnlyDeliverableRegistries(
  bus: MessageBus,
  producer: KafkaProducer,
  consumer: KafkaConsumer,
) {
  const orders = KafkaDeliverableRegistry.create()
    .command('process-order')
    .as<{ orderId: string }>()
  new KafkaCommandSink(bus, { producer, topic: 'orders', registry: orders })
  new KafkaCommandSource(bus, {
    consumer,
    topic: 'orders',
    registry: orders,
    onError: () => {},
  })

  const plain = TransportableMessageRegistry.create()
    .command('process-order')
    .as<{ orderId: string }, void>()
  // @ts-expect-error even with only `void` commands, a plain registry isn't accepted
  new KafkaCommandSink(bus, { producer, topic: 'orders', registry: plain })
}
