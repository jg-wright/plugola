# @plugola/plugin-manager

A small, dependency-aware plugin system. Register plugins, declare how they
relate to one another, then drive them through a two-phase lifecycle —
**enable** and **run** — with the manager taking care of ordering, concurrency,
dependency resolution, timeouts, cancellation, and error isolation.

## Installation

```bash
npm install @plugola/plugin-manager
```

## Concepts

A **plugin** is an object with a `name` and up to two lifecycle hooks:

- `enable(context)` — runs once when the plugin is activated. Use it for setup,
  and for adjusting the active plugin set (it can enable or disable other
  plugins).
- `run(context)` — runs once when you call `run()`, after `enable`. Use it for
  the plugin's actual work.

Both hooks are optional and may be async. A plugin also declares its
relationships:

- `dependencies` — plugins that must be enabled and run **before** this one.
  Enabling a plugin enables its dependencies automatically.
- `optionalDependencies` — plugins this one can use if present, but doesn't
  require. They only affect ordering when they're also enabled.

The **two phases** are independent calls:

1. `enablePlugins([...])` (or `enableAllPlugins()`) selects an active set and
   runs each plugin's `enable` hook, dependencies first.
2. `run()` invokes the `run` hook of every enabled plugin, dependencies first.

Within a phase, independent plugins run concurrently; dependencies always
complete before their dependers.

## Quick start

```typescript
import { PluginManager } from '@plugola/plugin-manager'

const pluginManager = new PluginManager()

pluginManager.registerPlugin('config', {
  enable() {
    // load configuration…
  },
})

pluginManager.registerPlugin('server', {
  dependencies: ['config'],
  run() {
    // start the server — 'config' is guaranteed to have run first
  },
})

await pluginManager.enablePlugins(['server']) // also enables 'config'
await pluginManager.run() // runs config, then server
```

## Injecting context

Plugins receive a **context** object in each hook. Out of the box that context
contains an `AbortSignal`, and — in `enable` — `enablePlugins` / `disablePlugins`.
You can inject your own values (a logger, storage, a message bus, …) via three
option callbacks. Their return types flow through to the plugin hooks, so
context is fully typed.

```typescript
import { PluginManager } from '@plugola/plugin-manager'
import { Logger, ConsoleLoggerBehavior } from '@plugola/logger'

const pluginManager = new PluginManager({
  // Merged into BOTH enable and run context:
  addContext: (pluginName) => ({
    log: new Logger(pluginName, new ConsoleLoggerBehavior()),
    sessionStorage,
  }),
  // Merged into the enable context only:
  addEnableContext: () => ({
    /* … */
  }),
  // Merged into the run context only:
  addRunContext: () => ({
    /* … */
  }),
})

pluginManager.registerPlugin('session-depth', {
  run({ log, sessionStorage, signal }) {
    const depth = Number(sessionStorage.getItem('visited') || '0') + 1
    log.debug('depth', depth)
    sessionStorage.setItem('visited', String(depth))
  },
})

await pluginManager.enablePlugins(['session-depth'])
await pluginManager.run()
```

## Dependencies

### Hard dependencies

Listing a plugin in `dependencies` guarantees it is enabled and run first, and
that enabling the depender pulls the dependency in automatically:

```typescript
pluginManager.registerPlugin('foo', { run() {} })
pluginManager.registerPlugin('bar', { dependencies: ['foo'], run() {} })

await pluginManager.enablePlugins(['bar']) // 'foo' is enabled too
await pluginManager.run() // foo runs before bar
```

Registration order doesn't matter — a plugin can be registered before the
dependencies it names.

### Optional dependencies

An optional dependency shapes ordering only when it is _also_ enabled. At enable
time, it must be requested in the **same batch** as its depender to be pulled in
and to gate the depender's `enable`:

```typescript
pluginManager.registerPlugin('opt', { run() {} })
pluginManager.registerPlugin('main', {
  optionalDependencies: ['opt'],
  run() {},
})

// opt enabled alongside main → main runs after opt
await pluginManager.enablePlugins(['main', 'opt'])
await pluginManager.run()

// opt not enabled → main runs without waiting for it
await pluginManager.enablePlugins(['main'])
await pluginManager.run()
```

## Enabling and disabling at runtime

Inside an `enable` hook you can change the active plugin set through the context:

```typescript
pluginManager.registerPlugin('feature-flags', {
  async enable({ enablePlugins, disablePlugins }) {
    if (await featureEnabled('beta')) enablePlugins(['beta-feature'])
    else disablePlugins(['beta-feature'])
  },
})
```

`disablePlugins` is cautious by default: a plugin still depended on by another
enabled plugin is **not** removed. It also disables any dependencies that nothing
else needs, and returns the count of plugins actually disabled:

```typescript
const removed = pluginManager.disablePlugins(['server'])
```

Pass `force` to also remove everything that depends on the target:

```typescript
pluginManager.disablePlugins(['config'], true) // config + its dependers
```

Disabling a plugin aborts its context `signal`, so in-flight async work can bail
out.

## Timeouts and cancellation

Provide `pluginTimeout` to cap how long any `enable` or `run` hook may take. A
plugin can override the cap for its **enable** hook only with its own
`enableTimeout`; the `run` hook always uses `pluginTimeout`. When a hook times
out, the plugin is disabled and its `signal` aborts. Well-behaved async hooks
should thread `signal` into their work:

```typescript
const pluginManager = new PluginManager({ pluginTimeout: 5000 })

pluginManager.registerPlugin('slow', {
  // Bounds the enable hook only (overrides pluginTimeout's 5000 for enable):
  enableTimeout: 1000,
  async enable({ signal }) {
    await loadConfig({ signal }) // aborted after 1000ms
  },
  async run({ signal }) {
    await fetch(url, { signal }) // aborted after pluginTimeout (5000ms)
  },
})
```

## Error handling

Plugin failures are isolated. By default an unknown plugin name throws, and a
hook that throws is logged with `console.error` (its `enable` is rolled back so
the plugin isn't left marked enabled). Override either behaviour:

```typescript
const pluginManager = new PluginManager({
  onUnknownPlugin(name, phase) {
    // 'enable' | 'disable' — log/collect instead of throwing
  },
  onPluginError(error, plugin, phase) {
    // 'enable' | 'run' — throw here to opt back into fail-fast
  },
})
```

When a hook throws, its siblings still proceed.

## Testing with `withOptions`

`withOptions` creates a sibling manager that shares the registered plugins and
dependency graph but has independent runtime state and layered context. It's
handy for swapping context in tests without re-registering everything:

```typescript
const testManager = pluginManager.withOptions({
  addContext: () => ({ log: fakeLogger }), // overrides matching keys
})

await testManager.enableAllPlugins()
await testManager.run()
```

## API overview

### `new PluginManager(options?)`

Options ([`PluginManagerOptions`](src/PluginManager.ts)):

| Option                                | Description                                           |
| ------------------------------------- | ----------------------------------------------------- |
| `addContext(name)`                    | Extra fields merged into both enable and run context. |
| `addEnableContext(name)`              | Extra fields merged into the enable context only.     |
| `addRunContext(name)`                 | Extra fields merged into the run context only.        |
| `pluginTimeout`                       | Default ms before an `enable`/`run` hook is aborted.  |
| `onUnknownPlugin(name, phase)`        | Handle an unregistered name instead of throwing.      |
| `onPluginError(error, plugin, phase)` | Handle a hook that throws instead of `console.error`. |

### Methods & properties

| Member                                                    | Description                                           |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `registerPlugin(plugin)` / `registerPlugin(name, plugin)` | Register a plugin.                                    |
| `enablePlugins(names)`                                    | Enable the named plugins and their dependencies.      |
| `enableAllPlugins()`                                      | Enable every registered plugin.                       |
| `disablePlugins(names, force?)`                           | Disable plugins; returns the count removed.           |
| `disableAllPlugins()`                                     | Disable every registered plugin.                      |
| `run()`                                                   | Run the `run` hook of every enabled plugin.           |
| `withOptions(options)`                                    | Sibling manager sharing plugins, new context/options. |
| `enabledPlugins`                                          | Array of currently enabled plugin names.              |

### Exported types

- [`Plugin<EC, RC>`](src/Plugin.ts) — a plugin definition.
- [`PluginManagerOptions`](src/PluginManager.ts) — constructor options.
- [`RunContext`](src/Context.ts), [`EnableContext`](src/Context.ts) — base context shapes.
- [`PluginManagerRunContext<PM>`](src/PluginManagerUtils.ts),
  [`PluginManagerEnableContext<PM>`](src/PluginManagerUtils.ts) — resolve a
  manager type's full context, useful for typing hooks against a concrete
  manager.

## License

MIT
