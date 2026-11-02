// Type-level tests for the message()/command() factories. Checked with `tsc`
// (see the `test:types` script), not run — the exported `assert*` functions
// exist only so the compiler checks their bodies.

import { expectTypeOf } from 'vitest'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'
import type { Message, MessageFactory } from '../src/Message/Message.ts'
import type {
  CommandMessage,
  CommandMessageFactory,
} from '../src/Message/CommandMessage.ts'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'

// --- message(): the instance is the payload plus Message -------------------

const Clicked = message<{ x: number; y: number }>('clicked')

const clicked = Clicked({ x: 1, y: 2 })
expectTypeOf(clicked.x).toEqualTypeOf<number>()
expectTypeOf(clicked.y).toEqualTypeOf<number>()
expectTypeOf(clicked.$name).toEqualTypeOf<string>()
expectTypeOf(clicked).toExtend<Message>()
expectTypeOf(Clicked.$name).toEqualTypeOf<string>()

// --- message(): no payload when the type argument is omitted ----------------

const Opened = message('opened')

const opened = Opened()
expectTypeOf(opened).toExtend<Message>()
expectTypeOf(opened.$name).toEqualTypeOf<string>()

export function assertPayloadIsRequiredWhenPresent() {
  // @ts-expect-error a message with required payload fields cannot be called bare
  Clicked()
}

// --- command(): the response type flows through to invoke() -----------------

const ListFiles = command<{ dir: string }, string>('list-files')

const listFiles = ListFiles({ dir: '/tmp' })
expectTypeOf(listFiles.dir).toEqualTypeOf<string>()
expectTypeOf(listFiles).toExtend<CommandMessage<string>>()

// --- factory outputs are usable as the bus's general class types -------------

expectTypeOf<typeof Clicked>().toExtend<
  MessageFactory<{ x: number; y: number }>
>()
expectTypeOf<typeof ListFiles>().toExtend<
  CommandMessageFactory<string, { dir: string }>
>()

export async function assertResponseType(gateway: MessageGateway) {
  const files = await gateway.invoke(ListFiles({ dir: '/tmp' })).collect()
  expectTypeOf(files).toEqualTypeOf<string[]>()
}

// --- local payloads may hold live references ---------------------------------

const Occurred = message<{ at: Date }>('occurred')
const RenderInto = command<{ target: Widget }, void>('render-into')

export function assertLivePayloads(gateway: MessageGateway) {
  gateway.emit(Clicked({ x: 1, y: 2 }))
  gateway.emit(Occurred({ at: new Date() }))
  gateway.invoke(RenderInto({ target: new Widget('root') }))
}

// --- fixtures --------------------------------------------------------------

/** Stands in for a live, non-serializable reference (e.g. an `HTMLElement`). */
class Widget {
  constructor(readonly id: string) {}
  render() {}
}
