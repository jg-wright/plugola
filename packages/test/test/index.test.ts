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

  async afterInit({ messageBus }, running) {
    messageBus.resume()
    await running
    messageBus.pause()
  },

  async afterRun({ messageBus }) {
    messageBus.resume()
  },

  tests: {
    'pluginContext is different for each plugin': [
      {
        name: 'test',
        run({ pluginName }) {
          expect(pluginName).toBe('test')
        },
      },
      {
        name: 'test 2',
        run({ pluginName }) {
          expect(pluginName).toBe('test 2')
        },
      },
    ],

    'testContext is the same for every plugin': [
      {
        name: 'test',
        run({ gateway, message: { Mung }, mung }) {
          gateway.register(Mung, (_, { send }) => {
            send(mung)
          })
        },
      },
      {
        name: 'test 2',
        async run({ gateway, message: { Mung }, mung }) {
          // console.info(await gateway.invoke(Mung({})).collect())
          expect(await gateway.invoke(Mung({})).first()).toBe(mung)
        },
      },
    ],
  },
})
