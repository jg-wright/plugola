import { expect, expectTypeOf } from 'vitest'
import { command, MessageBus } from '@plugola/message-bus'
import { PluginManager } from '@plugola/plugin-manager'
import { testPlugin } from '../src/vitest.js'

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

testPlugin({
  pluginManager: host,
  plugin: 'The plugin',

  onStarted() {
    messageBus.resume()
  },

  tests: {
    "a test's pluginContext reaches the plugin under test": {
      pluginContext: () => ({ answer: 'for this test' }),
      async run({ gateway }) {
        expect(await gateway.invoke(Mung()).first()).toBe('for this test')
      },
    },
  },
})

testPlugin({
  pluginManager: host,
  plugin: 'The plugin',
  testContext: () => ({ suffix: 'and the test' }),

  pluginContext(pluginName, { answer, suffix }) {
    expectTypeOf(answer).toEqualTypeOf<string>()
    expectTypeOf(suffix).toEqualTypeOf<string>()
    return { answer: `${answer} ${suffix} for ${pluginName}` }
  },

  onStarted() {
    messageBus.resume()
  },

  tests: {
    "pluginContext is passed the host's context and testContext": {
      async run({ gateway }) {
        expect(await gateway.invoke(Mung()).first()).toBe(
          'from the host and the test for The plugin',
        )
      },
    },

    "a test's pluginContext is passed the host's context and testContext": {
      pluginContext: (_, { answer, suffix }) => ({
        answer: `${answer} ${suffix}, just here`,
      }),
      async run({ gateway }) {
        expect(await gateway.invoke(Mung()).first()).toBe(
          'from the host and the test, just here',
        )
      },
    },
  },
})

testPlugin({
  pluginManager: host,
  plugin: 'The plugin',
  testContext: () => ({ answer: 'from the test' }),
  pluginContext: (_, { answer }) => ({ seen: answer }),

  tests: {
    "testContext is layered over the host's context in what pluginContext is passed":
      {
        run({ seen }) {
          expect(seen).toBe('from the test')
        },
      },
  },
})
