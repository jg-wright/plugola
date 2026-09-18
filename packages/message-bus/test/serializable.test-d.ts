// Type-level tests for the Serializable payload constraint. These are checked
// with `tsc` (see the `test:types` script and tsconfig.test.json), not run:
// vitest's `test`-glob excludes `*.test-d.ts`, and the exported `assert*`
// functions below exist only so the compiler checks their bodies.

import { expectTypeOf } from 'vitest'
import type { MessageGateway } from '../src/Gateway/MessageGateway.js'
import type { Message } from '../src/Message/Message.js'
import { CommandMessage } from '../src/Message/CommandMessage.js'
import type { Serializable } from '../src/Message/Serializable.js'

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
  gateway.emit(new UserLoggedIn('u1', ['admin'], { seen: true, count: 1 }))

  // @ts-expect-error a Widget instance carries methods, so it is not serializable
  gateway.emit(new Clicked(new Widget('root')))

  // @ts-expect-error a function will not survive queuing
  gateway.emit(new WithCallback(() => {}))

  // @ts-expect-error the nested Date is not JSON-serializable
  gateway.emit(new WithNested({ at: new Date() }))
}

// --- invoke only accepts a serializable command payload --------------------

export function assertInvoke(gateway: MessageGateway) {
  // The command's DOM-shaped *response* is exempt; only its payload is checked.
  gateway.invoke(new GetWidget('root'))

  // @ts-expect-error the Widget payload is not serializable
  gateway.invoke(new RenderInto(new Widget('x')))
}

// --- fixtures --------------------------------------------------------------

class UserLoggedIn implements Message {
  readonly $name = 'user-logged-in'
  constructor(
    readonly userId: string,
    readonly roles: string[],
    readonly meta: { seen: boolean; count: number },
  ) {}
}

class Clicked implements Message {
  readonly $name = 'clicked'
  constructor(readonly target: Widget) {}
}

class WithCallback implements Message {
  readonly $name = 'with-callback'
  constructor(readonly cb: () => void) {}
}

class WithNested implements Message {
  readonly $name = 'with-nested'
  constructor(readonly payload: { at: Date }) {}
}

class GetWidget extends CommandMessage<Widget> {
  readonly $name = 'get-widget'
  constructor(readonly id: string) {
    super()
  }
}

class RenderInto extends CommandMessage<void> {
  readonly $name = 'render-into'
  constructor(readonly target: Widget) {
    super()
  }
}

/** Stands in for a live, non-serializable reference (e.g. an `HTMLElement`). */
class Widget {
  constructor(readonly id: string) {}
  render() {}
}
