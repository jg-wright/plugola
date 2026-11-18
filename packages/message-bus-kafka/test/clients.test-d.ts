// Type-level tests that a real Kafka client fits the channel's structural
// interfaces. Checked with `tsc` (see `test:types`), not run — the exported
// `assert*` function exists only so the compiler checks its body.
//
// Only kafkajs is checked here: @confluentinc/kafka-javascript is a native
// module with no prebuilt binary for every Node version CI runs, and compiling
// librdkafka on each `npm ci` isn't worth it for a type check.

import { expectTypeOf } from 'vitest'
import type { Consumer, Producer } from 'kafkajs'
import type { KafkaConsumer, KafkaProducer } from '../src/index.ts'

export function assertKafkaJSFits() {
  expectTypeOf<Producer>().toExtend<KafkaProducer>()
  expectTypeOf<Consumer>().toExtend<KafkaConsumer>()
}
