import { afterAll, beforeAll, describe, test } from '@jest/globals'
import { createTestPlugin } from './index.js'

export type * from './index.js'

/** `testPlugin`, declaring its tests with Jest. */
export const testPlugin = createTestPlugin({
  describe,
  test,
  beforeAll,
  afterAll,
})
