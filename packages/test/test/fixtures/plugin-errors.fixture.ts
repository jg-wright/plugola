// Run by ../plugin-errors.test.ts, which asserts how each of these tests ends.
import { expect } from 'vitest'
import { PluginManager } from '@plugola/plugin-manager'
import { testPlugin } from '../../src/vitest.js'

testPlugin({
  plugin: { name: 'The plugin' },

  tests: {
    'an assertion fails in a run hook': {
      run() {
        expect('actual').toBe('expected')
      },
    },

    'a test plugin throws from enable': {
      enable() {
        throw new Error('enable failed')
      },
    },

    'every plugin behaves': {
      run() {
        expect(true).toBe(true)
      },
    },
  },
})

testPlugin({
  plugin: {
    name: 'The failing plugin',
    run() {
      throw new Error('the plugin under test failed')
    },
  },

  tests: {
    'the plugin under test throws from run': {},
  },
})

const host = new PluginManager()

host.registerPlugin('The hosted plugin', {})

testPlugin({
  pluginManager: host,
  plugin: 'The hosted plugin',

  tests: {
    'an assertion fails in a run hook on a host manager': {
      run() {
        expect('actual').toBe('expected')
      },
    },
  },
})
