import { expect } from 'vitest'
import { PluginManager } from '@plugola/plugin-manager'
import { testPlugin } from '../src/vitest.js'

// A failing assertion in a plugin hook must fail the test, not be isolated and
// logged by the plugin manager.

testPlugin({
  plugin: { name: 'The plugin' },

  async afterInit(_, enabling) {
    await expect(enabling).rejects.toThrow('enable failed')
  },

  tests: {
    'enable errors reject': {
      enable() {
        throw new Error('enable failed')
      },
    },
  },
})

testPlugin({
  plugin: { name: 'The plugin' },

  async afterRun(_, running) {
    await expect(running).rejects.toThrow('run failed')
  },

  tests: {
    'run errors reject': {
      run() {
        throw new Error('run failed')
      },
    },
  },
})

testPlugin({
  pluginManager: host(),
  plugin: 'The plugin',

  async afterRun(_, running) {
    await expect(running).rejects.toThrow('run failed')
  },

  tests: {
    'run errors reject on a host manager': {
      run() {
        throw new Error('run failed')
      },
    },
  },
})

function host() {
  const pluginManager = new PluginManager()
  pluginManager.registerPlugin('The plugin', {})
  return pluginManager
}
