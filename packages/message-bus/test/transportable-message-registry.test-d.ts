// Type-level tests for TransportableMessageRegistry. Checked with `tsc` (see
// `test:types`), not run — the exported `assert*` functions exist only so the
// compiler checks their bodies.

import { expectTypeOf } from 'vitest'
import { TransportableMessageRegistry } from '../src/MessageRegistry/TransportableMessageRegistry.ts'
import type { MessageFactory } from '../src/Message/Message.ts'
import type {
  CommandMessageFactory,
  ResponseType,
} from '../src/Message/CommandMessage.ts'
import type { Transportable } from '../src/Message/Transportable.ts'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'

const registry = TransportableMessageRegistry.create()
  .message('clicked')
  .as<{ x: number; y: number }>()

  .command('listFiles')
  .as<{ dir: string }, string>()

// message() records the precise message factory type ...
const { clicked: Clicked } = registry.messages
expectTypeOf(Clicked).toExtend<MessageFactory<{ x: number; y: number }>>()
expectTypeOf(Clicked({ x: 1, y: 2 }).x).toEqualTypeOf<number>()

// ... and command() the precise command factory type, response type intact.
const { listFiles: ListFiles } = registry.commands
expectTypeOf(ListFiles).toExtend<
  CommandMessageFactory<string, { dir: string }>
>()

// Registering a message is what makes it Transportable — the `$encode`/`$decode`
// the bridge reads live on the registered class, not on the bare factory output.
expectTypeOf(Clicked).toExtend<Transportable<{ x: number; y: number }>>()
expectTypeOf(ListFiles).toExtend<Transportable<{ dir: string }>>()

// The response type must survive the `& Transportable<…>` intersection the
// registry adds — regression: it once collapsed to `unknown` on the responder's
// `send`, because inferring through the factory's call signature hit `& any`.
expectTypeOf<ResponseType<typeof ListFiles>>().toEqualTypeOf<string>()

export async function assertRegisteredCommandResponse(gateway: MessageGateway) {
  const files = await gateway.invoke(ListFiles({ dir: '/tmp' })).collect()
  expectTypeOf(files).toEqualTypeOf<string[]>()

  // A responder registered for a registry command sees a precisely-typed `send`.
  gateway.register(ListFiles, (_command, { send }) => {
    expectTypeOf(send).toEqualTypeOf<(value: string) => void>()
  })
}
