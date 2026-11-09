import { expect, test } from 'vitest'
import { startVitest } from 'vitest/node'
import { fileURLToPath } from 'node:url'

test("a plugin's error fails the step it was thrown in", async () => {
  const results = await runFixture('plugin-errors.fixture.ts')

  expect(results).toEqual({
    'an assertion fails in a run hook > init': ['passed'],
    'an assertion fails in a run hook > run': [
      'failed',
      "expected 'actual' to be 'expected' // Object.is equality",
    ],
    'a test plugin throws from enable > init': ['failed', 'enable failed'],
    'a test plugin throws from enable > run': ['passed'],
    'every plugin behaves > init': ['passed'],
    'every plugin behaves > run': ['passed'],
    'the plugin under test throws from run > init': ['passed'],
    'the plugin under test throws from run > run': [
      'failed',
      'the plugin under test failed',
    ],
    'an assertion fails in a run hook on a host manager > init': ['passed'],
    'an assertion fails in a run hook on a host manager > run': [
      'failed',
      "expected 'actual' to be 'expected' // Object.is equality",
    ],
  })
})

/**
 * Runs a spec from ./fixtures in its own vitest and returns how each of its
 * tests ended: its state, then its first error's message if it failed.
 */
async function runFixture(name: string) {
  const vitest = await startVitest(
    'test',
    [],
    {
      config: false,
      dir: fileURLToPath(new URL('fixtures', import.meta.url)),
      include: [name],
      reporters: [],
      watch: false,
    },
    {},
  )
  try {
    const results: Record<string, string[]> = {}
    for (const module of vitest.state.getTestModules())
      for (const testCase of module.children.allTests()) {
        const { state, errors } = testCase.result()
        results[testCase.fullName] = errors?.length
          ? [state, errors[0].message]
          : [state]
      }
    return results
  } finally {
    await vitest.close()
  }
}
