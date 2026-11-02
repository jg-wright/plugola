import { expect } from 'vitest'
import { testPlugin } from '../src/index.js'
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
