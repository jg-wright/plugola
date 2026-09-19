// Type-level tests for MessageRegistry. Checked with `tsc` (see `test:types`),
// not run — the exported `assert*` functions exist only so the compiler checks
// their bodies.

import { expectTypeOf } from 'vitest'
import { MessageRegistry } from '../src/Channel/MessageRegistry.ts'
import type { MessageClass } from '../src/Message/Message.ts'
import type { CommandMessageClass } from '../src/Message/CommandMessage.ts'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'

const registry = new MessageRegistry()

// register() returns the precise message class type ...
const Clicked = registry.registerMessage<{ x: number; y: number }>('clicked')
expectTypeOf(Clicked).toExtend<MessageClass<{ x: number; y: number }>>()
expectTypeOf(new Clicked({ x: 1, y: 2 }).x).toEqualTypeOf<number>()

// ... and command() the precise command class type, response type intact.
const ListFiles = registry.registerCommand<{ dir: string }, string>(
  'list-files',
)
expectTypeOf(ListFiles).toExtend<CommandMessageClass<string, { dir: string }>>()

export async function assertRegisteredCommandResponse(gateway: MessageGateway) {
  const files = await gateway.invoke(new ListFiles({ dir: '/tmp' })).collect()
  expectTypeOf(files).toEqualTypeOf<string[]>()
}
