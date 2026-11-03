import { expect, expectTypeOf } from 'vitest'
import { command, MessageBus } from '@plugola/message-bus'
import { PluginManager } from '@plugola/plugin-manager'
import { testPlugin } from '../src/index.js'

const Mung = command<{}, string>('mung')
const messageBus = new MessageBus()

const host = new PluginManager({
  addRunContext: (pluginName, { signal }) => ({
    gateway: messageBus.gateway(pluginName, signal),
  }),
  addContext: () => ({ answer: 'from the host' }),
})

host.registerPlugin('The plugin', {
  run({ gateway, answer }) {
    gateway.register(Mung, (_, { send }) => send(answer))
  },
})

host.registerPlugin('Unrelated', {
  run() {
    throw new Error('only the plugin under test and its tests are enabled')
  },
})

testPlugin({
  pluginManager: host,
  plugin: 'The plugin',

  onStarted() {
    messageBus.resume()
  },

  tests: {
    "plugins get the host's context": {
      async run({ gateway, answer, signal }) {
        expectTypeOf(answer).toEqualTypeOf<string>()
        expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
        expect(await gateway.invoke(Mung()).first()).toBe('from the host')
      },
    },
  },
})

testPlugin({
  pluginManager: host,
  plugin: 'The plugin',
  pluginContext: () => ({ answer: 'overridden' }),

  onStarted() {
    messageBus.resume()
  },

  tests: {
    "pluginContext is layered over the host's": {
      run({ answer }) {
        expect(answer).toBe('overridden')
      },
    },
  },
})
