# Plugola

**plugins**. Use them together or on their own.

The core idea: your app is a set of independent plugins. A **plugin manager**
decides which plugins are active and runs them in dependency order. The plugins
talk to each other through a **message bus** rather than importing one another,
so any one of them can be removed, swapped out, gated (for example on user
consent) or tested in isolation.

Every package is ESM-only, written in strict TypeScript, and published
independently to npm under the `@plugola` scope.

## Packages

### Core

| Package                                              | What it does                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@plugola/plugin-manager`](packages/plugin-manager) | Register plugins, declare their dependencies, and drive them through an `enable` → `run` lifecycle with ordering, concurrency, timeouts and gates. |
| [`@plugola/message-bus`](packages/message-bus)       | A message bus for plugins: publish/subscribe, interceptors, request/stream commands, per-participant pause/resume, and bridges between runtimes.   |
| [`@plugola/store`](packages/store)                   | Action/reducer state management with subscriptions, and dispatches queued until the store is resumed.                                              |
| [`@plugola/logger`](packages/logger)                 | A labelled, extendable logger whose output is decided by pluggable behaviours (console, disabled, file).                                           |

### Plugin tooling

| Package                                                            | What it does                                                                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@plugola/vendor-plugin-manager`](packages/vendor-plugin-manager) | A plugin manager that only enables and runs the plugins a user has consented to (IAB TCF v2).                                                  |
| [`@plugola/test`](packages/test)                                   | `testPlugin()`: helpers (vitest, node:test, or your own runner) for testing a plugin on its own, or as registered on your real plugin manager. |

### Utilities

| Package                                          | What it does                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [`@plugola/queue`](packages/queue)               | Runnable queues that buffer work while stopped and drain it in order when started.            |
| [`@plugola/graph`](packages/graph)               | A small typed graph with named edge types and BFS/DFS traversal (used by the plugin manager). |
| [`@plugola/query-params`](packages/query-params) | Parses URL query strings into typed values: booleans, arrays, flags and JSON.                 |
| [`@plugola/store-logger`](packages/store-logger) | Logs every `@plugola/store` action and resulting state through a `@plugola/logger`.           |

Each package's README has its full documentation.

## Quick start

Install the packages you need:

```sh
npm install @plugola/plugin-manager @plugola/message-bus @plugola/logger
```

Give every plugin its own bus gateway and logger, then let them communicate
through messages:

```typescript
import { PluginManager } from '@plugola/plugin-manager'
import { MessageBus, message } from '@plugola/message-bus'
import Logger from '@plugola/logger/Logger'
import ConsoleLoggerBehavior from '@plugola/logger/ConsoleLoggerBehavior'

// Messages are plain objects built by factories.
const Greeting = message<{ text: string }>('greeting')

const bus = new MessageBus()

// Whatever addContext returns is passed to each plugin's hooks, fully typed.
// Tying the gateway to the plugin's signal tears it down if the plugin is
// disabled.
const pluginManager = new PluginManager({
  addContext: (pluginName, { signal }) => ({
    gateway: bus.gateway(pluginName, signal),
    log: new Logger(pluginName, new ConsoleLoggerBehavior()),
  }),
})

pluginManager.registerPlugin('greeter', {
  run({ gateway }) {
    gateway.emit(Greeting({ text: 'hello' }))
  },
})

pluginManager.registerPlugin('listener', {
  run({ gateway, log }) {
    gateway.on(Greeting, ({ text }) => log.info('heard', text))
  },
})

await pluginManager.enableAllPlugins()
await pluginManager.run({
  // The bus starts paused, so the greeting is held until every plugin has
  // subscribed, whichever order the plugins ran in.
  onStarted: () => bus.resume(),
})
// → [listener] heard hello
```

Next steps:

- [Plugin manager](packages/plugin-manager/README.md): dependencies, gates,
  timeouts, and enabling or disabling plugins at runtime.
- [Message bus](packages/message-bus/README.md): commands, interceptors, and
  bridging buses across windows, workers and servers.
- [Testing plugins](packages/test/README.md) with `@plugola/test`.

## Requirements

- **ESM only.** The packages are `"type": "module"` and can't be `require()`d
  from CommonJS.
- **TypeScript** users should use `"moduleResolution": "nodenext"` (or
  `"bundler"`) so that subpath exports such as `@plugola/logger/Logger` resolve.
- The code targets ES2020. It runs in browsers and in currently supported
  Node.js versions (CI tests Node 24 and 26).

## Contributing

Bug reports, ideas and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) to set up the repo, run the tests, and learn
how commits and releases work.

## License

[MIT](LICENSE). Each package also ships its own copy of the license.
