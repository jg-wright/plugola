// Run by Jest in ESM mode (see "jest" in package.json). Jest won't load
// TypeScript without a transform, so this is plain JS against the built output
// — `npm run build` first.
import { expect } from '@jest/globals'
import { command, MessageBus } from '@plugola/message-bus'
import { testPlugin } from '../dist/jest.js'

const Ping = command('ping')

testPlugin({
  testContext() {
    return { messageBus: new MessageBus() }
  },

  pluginContext(pluginName, { messageBus }) {
    return { gateway: messageBus.gateway(pluginName) }
  },

  plugin: {
    name: 'The plugin',
    run({ gateway }) {
      gateway.register(Ping, (_, { send }) => send('pong'))
    },
  },

  onStarted({ messageBus }) {
    messageBus.resume()
  },

  tests: {
    'runs under jest': {
      async run({ gateway }) {
        expect(await gateway.invoke(Ping({})).first()).toBe('pong')
      },
    },
  },
})
