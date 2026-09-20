// Type-level tests for the Serializable payload constraint. These are checked
// with `tsc` (see the `test:types` script and tsconfig.test.json), not run:
// vitest's `test`-glob excludes `*.test-d.ts`, and the exported `assert*`
// functions below exist only so the compiler checks their bodies.

import { expectTypeOf } from 'vitest'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'
import type { Serializable } from '../src/Message/Serializable.ts'

// --- fixtures --------------------------------------------------------------

const UserLoggedIn = message<{
  userId: string
  roles: string[]
  meta: { seen: boolean; count: number }
}>('user-logged-in')

const Clicked = message<{ target: Widget }>('clicked')

const WithCallback = message<{ cb: () => void }>('with-callback')

const WithNested = message<{ payload: { at: Date } }>('with-nested')

const GetWidget = command<{ id: string }, Widget>('get-widget')

const RenderInto = command<{ target: Widget }, void>('render-into')

/** Stands in for a live, non-serializable reference (e.g. an `HTMLElement`). */
class Widget {
  constructor(readonly id: string) {}
  render() {}
}

// --- Serializable<T> leaves JSON-safe payloads unchanged -------------------

expectTypeOf<Serializable<string>>().toEqualTypeOf<string>()
expectTypeOf<Serializable<number>>().toEqualTypeOf<number>()
expectTypeOf<Serializable<boolean>>().toEqualTypeOf<boolean>()
expectTypeOf<Serializable<null>>().toEqualTypeOf<null>()
expectTypeOf<Serializable<string | undefined>>().toEqualTypeOf<
  string | undefined
>()
expectTypeOf<Serializable<string[]>>().toEqualTypeOf<string[]>()
expectTypeOf<Serializable<[string, number]>>().toEqualTypeOf<[string, number]>()

type Nested = { a: string; b: { c: number[]; d: boolean } }
expectTypeOf<Serializable<Nested>>().toEqualTypeOf<Nested>()

// $-prefixed metadata keys ($name, $responseType, …) are exempt: a function
// under such a key would otherwise be rejected.
type WithMeta = { $name: 'x'; $responseType: () => void; foo: string }
expectTypeOf<Serializable<WithMeta>>().toEqualTypeOf<WithMeta>()

// --- Serializable<T> rejects non-JSON leaves -------------------------------

expectTypeOf<Serializable<() => void>>().not.toEqualTypeOf<() => void>()
expectTypeOf<Serializable<Date>>().not.toEqualTypeOf<Date>()
expectTypeOf<Serializable<symbol>>().not.toEqualTypeOf<symbol>()
expectTypeOf<Serializable<bigint>>().not.toEqualTypeOf<bigint>()
expectTypeOf<Serializable<Widget>>().not.toEqualTypeOf<Widget>()

// --- emit only accepts a serializable payload ------------------------------

export function assertEmit(gateway: MessageGateway) {
  gateway.emit(
    new UserLoggedIn({
      userId: 'u1',
      roles: ['admin'],
      meta: { seen: true, count: 1 },
    }),
  )

  // @ts-expect-error a Widget instance carries methods, so it is not serializable
  gateway.emit(new Clicked({ target: new Widget('root') }))

  // @ts-expect-error a function will not survive queuing
  gateway.emit(new WithCallback({ cb: () => {} }))

  // @ts-expect-error the nested Date is not JSON-serializable
  gateway.emit(new WithNested({ payload: { at: new Date() } }))
}

// --- invoke only accepts a serializable command payload --------------------

export function assertInvoke(gateway: MessageGateway) {
  // The command's DOM-shaped *response* is exempt; only its payload is checked.
  gateway.invoke(new GetWidget({ id: 'root' }))

  // @ts-expect-error the Widget payload is not serializable
  gateway.invoke(new RenderInto({ target: new Widget('x') }))
}
