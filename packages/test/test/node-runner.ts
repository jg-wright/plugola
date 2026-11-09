import assert from 'node:assert/strict'
import { command, MessageBus } from '@plugola/message-bus'
// Run by `node --test`, which can't resolve `../src/*.js` to `.ts`, so this
// exercises the built output — `npm run build` first.
import { testPlugin } from '../dist/node.js'

const Ping = command<{}, string>('ping')

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
    'runs under node:test': {
      async run({ gateway }) {
        assert.equal(await gateway.invoke(Ping({})).first(), 'pong')
      },
    },
  },
})
