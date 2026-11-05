import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('reads location.search when there is no process global', () => {
  expect(
    importInChildProcess(`
      globalThis.location = { search: '?foo=bar' }
      delete globalThis.process
    `),
  ).toEqual({ foo: 'bar' })
})

test('reads PLUGOLA_QUERY when there is no location global', () => {
  expect(importInChildProcess('process.env.PLUGOLA_QUERY = "foo=bar"')).toEqual(
    { foo: 'bar' },
  )
})

/**
 * Imports the module in a fresh node process, since removing the `process`
 * global would break the test runner itself.
 */
function importInChildProcess(setup: string) {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        const { stdout } = process
        ${setup}
        const { default: queryParams } = await import('@plugola/query-params')
        stdout.write(JSON.stringify(queryParams))
      `,
    ],
    { cwd: import.meta.dirname, encoding: 'utf8' },
  )
  return JSON.parse(output)
}
