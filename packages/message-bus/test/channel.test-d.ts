// Type-level tests for the Frame discriminated union. Checked with `tsc` (see
// `test:types`), not run — the exported `assert*` function exists only so the
// compiler checks its body.

import { expectTypeOf } from 'vitest'
import type { Frame } from '../src/Channel/Channel.ts'

// Narrowing on `kind` exposes only that variant's fields.
export function assertFrameNarrowing(frame: Frame) {
  switch (frame.kind) {
    case 'message':
      expectTypeOf(frame.name).toEqualTypeOf<string>()
      expectTypeOf(frame.payload).toEqualTypeOf<unknown>()
      // @ts-expect-error a message frame has no correlationId
      frame.correlationId
      break
    case 'command':
      expectTypeOf(frame.correlationId).toEqualTypeOf<string>()
      break
    case 'response':
      expectTypeOf(frame.value).toEqualTypeOf<unknown>()
      break
    case 'response-error':
      expectTypeOf(frame.error.message).toEqualTypeOf<string>()
      break
  }
}
