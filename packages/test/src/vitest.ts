import { afterAll, beforeAll, describe, test } from 'vitest'
import { createTestPlugin } from './index.js'

export type * from './index.js'

/** `testPlugin`, declaring its tests with vitest. */
export const testPlugin = createTestPlugin({
  describe,
  test,
  beforeAll,
  afterAll,
})
