# @plugola/test

> Test plugola plugins

`testPlugin` declares a `describe` per entry in `tests`. Each one enables the
plugin under test alongside that entry's plugins (`init`), then runs them
(`run`), so the entry's plugins can drive and assert on the plugin under test.

## Choosing a test runner

Import `testPlugin` from the entry point for your runner:

```typescript
import { testPlugin } from '@plugola/test/vitest' // vitest
import { testPlugin } from '@plugola/test/jest' // Jest
import { testPlugin } from '@plugola/test/node' // node:test
```

For any other runner, build one with `createTestPlugin`, passing its `describe`,
`test`, and once-per-`describe` setup and teardown hooks:

```typescript
import { createTestPlugin } from '@plugola/test'

const testPlugin = createTestPlugin({ describe, test, beforeAll, afterAll })
```

`vitest` and `@jest/globals` are optional peer dependencies — install the one
for the entry point you use.

This package is ESM-only, so under Jest it needs
[ESM support](https://jestjs.io/docs/ecmascript-modules) (run Jest with
`--experimental-vm-modules`).

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

Here `pluginContext` is passed the host's context for that plugin, with
`testContext` layered over it, so it can build on what the host provides:

```typescript
testPlugin({
  pluginManager,
  plugin: 'greeter',
  testContext: () => ({ level: 'silent' }),
  pluginContext: (pluginName, { log, level }) => ({
    log: log.child({ pluginName, level }),
  }),

  tests: {
    // ...
  },
})
```

## Setting up a single test

A test with a single plugin can set its own `pluginContext`. It's layered over
the top-level `pluginContext` for every plugin in that test, including the
plugin under test, so a test can change just the parts it cares about. It's
passed the same context as the top-level `pluginContext`:

```typescript
testPlugin({
  pluginManager,
  plugin: 'greeter',
  pluginContext: () => ({ delay: 0, log: silentLog }),

  tests: {
    'greets promptly': {
      run() {},
    },

    'greets slowly': {
      pluginContext: () => ({ delay: 1000 }),
      run() {},
    },
  },
})
```

## Failing tests

The plugin manager isolates an error thrown from a plugin's hook so that one
plugin can't take down the others. `testPlugin` collects those errors instead:
one thrown from any plugin's `enable` (the plugin under test's or a test
plugin's) fails that entry's `init` test, and one from `run` fails its `run`
test. So assertions can live in the test plugins' hooks. When several plugins
fail, the test fails with an `AggregateError` of them all.

## Hooks

| Hook                               | Called with                                                          |
| ---------------------------------- | -------------------------------------------------------------------- |
| `afterInit(testContext, enabling)` | the promise of enabling the plugins                                  |
| `afterRun(testContext, running)`   | the promise of running them                                          |
| `onStarted(testContext)`           | once every run hook has been invoked; passed to `run({ onStarted })` |
