import { after, before, describe, test } from 'node:test'
import { createTestPlugin } from './index.js'

export type * from './index.js'

/** `testPlugin`, declaring its tests with `node:test`. */
export const testPlugin = createTestPlugin({
  describe,
  test,
  beforeAll: before,
  afterAll: after,
})
