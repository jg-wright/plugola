import { expect, expectTypeOf } from 'vitest'
import { testPlugin } from '../src/vitest.js'
import { command, MessageBus } from '@plugola/message-bus'

testPlugin({
  testContext() {
    return {
      mung: {},
      message: {
        Mung: command<{}, {}>('mung'),
      },
      messageBus: new MessageBus(),
    }
  },

  pluginContext(pluginName, { messageBus }) {
    return { pluginName, gateway: messageBus.gateway(pluginName) }
  },

  plugin: {
    name: 'The plugin',
    run({ gateway, message: { Mung }, mung }) {
      gateway.register(Mung, (_, { send }) => {
        send(mung)
      })
    },
  },

  async afterInit({ messageBus }, initiating) {
    await messageBus.resumeUntil(initiating)
  },

  async afterRun({ messageBus }) {
    messageBus.resume()
  },

  tests: {
    'pluginContext is different for each plugin': [
      {
        run({ pluginName }) {
          expect(pluginName).toBe('test 0')
        },
      },
      {
        run({ pluginName }) {
          expect(pluginName).toBe('test 1')
        },
      },
    ],

    'testContext is the same for every plugin': {
      async run({ gateway, message: { Mung }, mung }) {
        expect(await gateway.invoke(Mung({})).first()).toBe(mung)
      },
    },
  },
})

testPlugin({
  testContext: () => ({ seen: {} as Record<string, string> }),

  pluginContext: () => ({ speed: 'fast', colour: 'red' }),

  plugin: {
    name: 'The plugin',
    enable({ seen, speed }) {
      seen.speed = speed
    },
  },

  tests: {
    'pluginContext comes from the top level by default': {
      run({ speed, colour }) {
        expect(speed).toBe('fast')
        expect(colour).toBe('red')
      },
    },

    "a test's pluginContext is layered over the top level's": {
      pluginContext: () => ({ speed: 'slow' }),
      run({ speed, colour }) {
        expectTypeOf(speed).toEqualTypeOf<string>()
        expect(speed).toBe('slow')
        expect(colour).toBe('red')
      },
    },

    "a test's pluginContext reaches the plugin under test": {
      pluginContext: (pluginName) => ({ speed: `slow for ${pluginName}` }),
      run({ seen }) {
        expect(seen.speed).toBe('slow for The plugin')
      },
    },
  },
})
