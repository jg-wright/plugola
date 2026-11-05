# @plugola/test

> Test plugola plugins

`testPlugin` declares a vitest `describe` per entry in `tests`. Each one enables
the plugin under test alongside that entry's plugins (`init`), then runs them
(`run`), so the entry's plugins can drive and assert on the plugin under test.

## Testing a plugin on its own manager

The plugin's context comes from `testContext` (shared by every plugin in the
test) and `pluginContext` (per plugin).

```typescript
testPlugin({
  testContext() {
    return { messageBus: new MessageBus() }
  },

  pluginContext(pluginName, { messageBus }) {
    return { gateway: messageBus.gateway(pluginName) }
  },

  plugin: {
    name: 'greeter',
    run({ gateway }) {
      gateway.register(Greet, ({ name }, { send }) => send(`Hello ${name}`))
    },
  },

  onStarted({ messageBus }) {
    messageBus.resume()
  },

  tests: {
    'greets by name': {
      async run({ gateway }) {
        expect(await gateway.invoke(Greet({ name: 'Ada' })).first()).toBe(
          'Hello Ada',
        )
      },
    },
  },
})
```

## Testing a plugin registered on a host manager

Pass the host's `pluginManager` and the name the plugin is registered under.
Tests run on a sibling manager (`pluginManager.withOptions`), so every plugin
gets the host's context, and its inferred types, with `pluginContext` layered
over it. Only the plugin under test and the test's own plugins are enabled.

```typescript
testPlugin({
  pluginManager,
  plugin: 'greeter',
  pluginContext: () => ({ log: silentLog }),

  onStarted() {
    messageBus.resume()
  },

  tests: {
    'greets by name': {
      async run({ broker }) {
        expect(await broker.invoke(Greet({ name: 'Ada' })).first()).toBe(
          'Hello Ada',
        )
      },
    },
  },
})
```

## Hooks

| Hook                               | Called with                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| `afterInit(testContext, enabling)` | the promise of enabling the plugins                                  |
| `afterRun(testContext, running)`   | the promise of running them                                          |
| `onStarted(testContext)`           | once every run hook has been invoked; passed to `run({ onStarted })` |
