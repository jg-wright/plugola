// Type-level tests for the Serializable payload constraint, which applies to
// messages registered on a TransportableMessageRegistry. These are checked
// with `tsc` (see the `test:types` script and tsconfig.test.json), not run:
// vitest's `test`-glob excludes `*.test-d.ts`, and the exported `assert*`
// functions below exist only so the compiler checks their bodies.

import { expectTypeOf } from 'vitest'
import type { MessageGateway } from '../src/Participant/MessageGateway.ts'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'
import type { Serializable } from '../src/Message/Serializable.ts'
import { TransportableMessageRegistry } from '../src/MessageRegistry/TransportableMessageRegistry.ts'

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

// --- local emit/invoke accept live references -------------------------------

export function assertEmit(gateway: MessageGateway) {
  gateway.emit(
    UserLoggedIn({
      userId: 'u1',
      roles: ['admin'],
      meta: { seen: true, count: 1 },
    }),
  )
  gateway.emit(Clicked({ target: new Widget('root') }))
  gateway.emit(WithCallback({ cb: () => {} }))
  gateway.emit(WithNested({ payload: { at: new Date() } }))
}

export function assertInvoke(gateway: MessageGateway) {
  gateway.invoke(GetWidget({ id: 'root' }))
  gateway.invoke(RenderInto({ target: new Widget('x') }))
}

// --- transportable messages must be serializable -----------------------------

export function assertTransportable() {
  TransportableMessageRegistry.create()
    .message('user-logged-in')
    .as<{ userId: string; roles: string[] }>()
    .command('get-widget')
    .as<{ id: string }, Widget>()

  TransportableMessageRegistry.create()
    .message('clicked')
    // @ts-expect-error the default codec puts the Widget on the wire
    .as<{ target: Widget }>()

  TransportableMessageRegistry.create()
    .command('render-into')
    // @ts-expect-error the default codec puts the Widget on the wire
    .as<{ target: Widget }, void>()

  // A full codec decides what crosses the wire, so the payload may hold anything.
  TransportableMessageRegistry.create()
    .message('clicked')
    .as<{ target: Widget }>({
      encode: ({ target }) => ({ id: target.id }),
      decode: ({ id }) => Clicked({ target: new Widget(id) }),
    })
}
