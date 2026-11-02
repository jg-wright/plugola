import { RunContext, EnableContext } from './Context.js'
import { Plugin } from './Plugin.js'
import { race, timeout } from '@johngw/async'
import DependencyGraph from './DependencyGraph.js'

/**
 * Configuration for a {@link PluginManager}.
 *
 * The three `add*Context` callbacks let you inject arbitrary values into the
 * context objects plugins receive. Their return types become the manager's
 * `ExtraContext` / `ExtraEnableContext` / `ExtraRunContext` type parameters, so
 * plugins get fully typed context.
 *
 * @typeParam ExtraContext - Extra fields merged into *both* the enable and run
 * context (from {@link addContext}).
 * @typeParam ExtraEnableContext - Extra fields merged into the enable context
 * only (from {@link addEnableContext}).
 * @typeParam ExtraRunContext - Extra fields merged into the run context only
 * (from {@link addRunContext}).
 */
export interface PluginManagerOptions<
  ExtraContext extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
> {
  /**
   * Returns extra fields merged into every plugin context — both `enable` and
   * `run`. Called once per hook invocation with the plugin's name.
   */
  addContext?(pluginName: string): ExtraContext
  /**
   * Returns extra fields merged into the `enable` context only. Called with the
   * plugin's name when its `enable` hook is invoked.
   */
  addEnableContext?(pluginName: string): ExtraEnableContext
  /**
   * Returns extra fields merged into the `run` context only. Called with the
   * plugin's name when its `run` hook is invoked.
   */
  addRunContext?(pluginName: string): ExtraRunContext
  /**
   * Default milliseconds to wait for a plugin's `enable` or `run` hook before
   * aborting it. When a hook times out the plugin is disabled and its `signal`
   * aborts. Omit for no timeout. A plugin can override the enable timeout with
   * {@link Plugin.enableTimeout}.
   */
  pluginTimeout?: number
  /**
   * Called when {@link PluginManager.enablePlugins} or
   * {@link PluginManager.disablePlugins} is given a plugin name that isn't
   * registered. Defaults to throwing. Provide a handler to log, collect, or
   * otherwise tolerate unknown plugins — if it doesn't throw, the name is
   * skipped.
   */
  onUnknownPlugin?(pluginName: string, phase: 'enable' | 'disable'): void
  /**
   * Called when a plugin's `enable` or `run` throws. The failure is isolated —
   * the plugin is rolled back (for `enable`) and its siblings keep going —
   * then reported here. Defaults to `console.error`. Throw from this handler to
   * opt back into fail-fast behaviour.
   */
  onPluginError?(error: unknown, plugin: Plugin, phase: 'enable' | 'run'): void
}

/**
 * Registers plugins, resolves their dependencies, and drives them through a
 * two-phase lifecycle: **enable** (activate a selected set of plugins and their
 * dependencies) and **run** (invoke each enabled plugin's work). Within each
 * phase plugins run concurrently, but a plugin's dependencies always complete
 * before the plugin itself.
 *
 * Typical flow:
 *
 * ```typescript
 * const pm = new PluginManager()
 * pm.registerPlugin('greeter', { run: () => console.log('hi') })
 * await pm.enablePlugins(['greeter'])
 * await pm.run()
 * ```
 *
 * Plugin failures are isolated: a hook that throws is rolled back (for `enable`)
 * and reported via the `onPluginError` option rather than taking down its
 * siblings.
 *
 * @typeParam ExtraContext - Extra context injected into both hooks, from the
 * `addContext` option.
 * @typeParam ExtraEnableContext - Extra context injected into `enable`, from the
 * `addEnableContext` option.
 * @typeParam ExtraRunContext - Extra context injected into `run`, from the
 * `addRunContext` option.
 */
export default class PluginManager<
  ExtraContext extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
> {
  #plugins: Record<string, Plugin> = {}
  #dependencyGraph = new DependencyGraph<Plugin>()
  #pendingDependencies = new Map<
    string,
    { source: Plugin; optional: boolean }[]
  >()
  #ran = new WeakSet<Plugin>()
  #abortControllers = new WeakMap<Plugin, AbortController>()
  #pendingBatches = new Set<Set<string>>()
  #enabledPlugins = new Set<string>()
  #options: PluginManagerOptions<
    ExtraContext,
    ExtraEnableContext,
    ExtraRunContext
  >

  /**
   * @param options - Context injectors and lifecycle behaviour. See
   * {@link PluginManagerOptions}.
   */
  constructor(
    options: PluginManagerOptions<
      ExtraContext,
      ExtraEnableContext,
      ExtraRunContext
    > = {},
  ) {
    this.#options = options
  }

  /** Names of the currently enabled plugins, as a new array. */
  get enabledPlugins() {
    return [...this.#enabledPlugins]
  }

  /**
   * Create a sibling manager that shares this one's registered plugins but takes
   * new options — primarily for testing, where you want to **replace** parts of
   * the injected context rather than add to it.
   *
   * @remarks
   * The extra-context callbacks are layered: for each plugin the returned
   * manager first calls this manager's `add*Context`, then the ones passed here,
   * so overlapping keys from `options` win.
   *
   * The returned manager reuses the registered plugins and the dependency graph
   * but has its own independent runtime state (enabled/ran plugins and abort
   * controllers), so running it doesn't disturb this one.
   *
   * @param options - Options for the sibling manager. Its `add*Context`
   * callbacks are merged over this manager's.
   * @returns A new {@link PluginManager} sharing this one's plugins.
   */
  withOptions(
    options: PluginManagerOptions<
      ExtraContext,
      ExtraEnableContext,
      ExtraRunContext
    >,
  ) {
    const pluginManager = new PluginManager({
      ...options,
      addContext: (pluginName) =>
        ({
          ...this.#options.addContext?.(pluginName),
          ...options.addContext?.(pluginName),
        }) as ExtraContext,
      addEnableContext: (pluginName) =>
        ({
          ...this.#options.addEnableContext?.(pluginName),
          ...options.addEnableContext?.(pluginName),
        }) as ExtraEnableContext,
      addRunContext: (pluginName) =>
        ({
          ...this.#options.addRunContext?.(pluginName),
          ...options.addRunContext?.(pluginName),
        }) as ExtraRunContext,
    })
    pluginManager.#plugins = this.#plugins
    pluginManager.#dependencyGraph = this.#dependencyGraph
    return pluginManager
  }

  /**
   * Register a plugin whose `name` is a property of the object.
   *
   * @remarks
   * Registration order doesn't matter: a plugin may be registered before the
   * dependencies it names, and the manager wires the edges up once they appear.
   * Registering a name that already exists replaces the previous plugin.
   */
  registerPlugin(
    plugin: Plugin<
      EnableContext & ExtraContext & ExtraEnableContext,
      RunContext & ExtraContext & ExtraRunContext
    >,
  ): void

  /**
   * Register a plugin under an explicit `name`, with the plugin definition
   * supplied separately (without its own `name` field).
   *
   * @remarks
   * Registration order doesn't matter: a plugin may be registered before the
   * dependencies it names, and the manager wires the edges up once they appear.
   * Registering a name that already exists replaces the previous plugin.
   */
  registerPlugin(
    name: string,
    plugin: Omit<
      Plugin<
        EnableContext & ExtraContext & ExtraEnableContext,
        RunContext & ExtraContext & ExtraRunContext
      >,
      'name'
    >,
  ): void

  registerPlugin(
    nameOrPlugin:
      | string
      | Plugin<
          EnableContext & ExtraContext & ExtraEnableContext,
          RunContext & ExtraContext & ExtraRunContext
        >,
    plugin?: Omit<
      Plugin<
        EnableContext & ExtraContext & ExtraEnableContext,
        RunContext & ExtraContext & ExtraRunContext
      >,
      'name'
    >,
  ) {
    this.#addPlugin(
      plugin
        ? { name: nameOrPlugin as string, ...plugin }
        : (nameOrPlugin as Plugin<
            EnableContext & ExtraContext & ExtraEnableContext,
            RunContext & ExtraContext & ExtraRunContext
          >),
    )
  }

  #addPlugin(plugin: Plugin) {
    this.#plugins[plugin.name] = plugin
    this.#dependencyGraph.vertex(plugin)

    if (plugin.dependencies)
      for (const dependency of plugin.dependencies)
        this.#addDependencyEdge(plugin, dependency, false)

    if (plugin.optionalDependencies)
      for (const dependency of plugin.optionalDependencies)
        this.#addDependencyEdge(plugin, dependency, true)

    // Wire up any plugins that were registered before this one and depend on it.
    this.#resolvePendingDependencies(plugin)
  }

  #addDependencyEdge(
    source: Plugin,
    dependencyName: string,
    optional: boolean,
  ) {
    const dependency = this.#plugins[dependencyName]

    // Registration order shouldn't matter: if the dependency isn't registered
    // yet, remember the edge and wire it when the dependency shows up.
    if (!dependency) {
      const pending = this.#pendingDependencies.get(dependencyName) ?? []
      pending.push({ source, optional })
      this.#pendingDependencies.set(dependencyName, pending)
      return
    }

    this.#wireDependency(source, dependency, optional)
  }

  #resolvePendingDependencies(dependency: Plugin) {
    const pending = this.#pendingDependencies.get(dependency.name)
    if (!pending) return
    this.#pendingDependencies.delete(dependency.name)
    for (const { source, optional } of pending)
      this.#wireDependency(source, dependency, optional)
  }

  #wireDependency(source: Plugin, dependency: Plugin, optional: boolean) {
    if (optional)
      this.#dependencyGraph.addOptionalDependency(source, dependency)
    else this.#dependencyGraph.addDependency(source, dependency)
  }

  /**
   * Invoke the `run` hook of every enabled plugin. Each plugin runs after its
   * dependencies (and its enabled optional dependencies) have run, and each runs
   * at most once. Resolves when all enabled plugins have finished running.
   *
   * @throws If the enabled plugins contain a circular `run` dependency.
   */
  async run() {
    let promises: Promise<void>[] = []
    for (const pluginName of this.#enabledPlugins)
      promises.push(this.#runPlugin(this.#getPlugin(pluginName)))
    await Promise.all(promises)
  }

  /** Enable every registered plugin. */
  async enableAllPlugins() {
    await this.enablePlugins(Object.keys(this.#plugins))
  }

  /**
   * Enable the named plugins and their dependencies.
   *
   * @remarks
   * The names form a single enable batch. Hard dependencies are always enabled;
   * an optional dependency is only enabled if it is named in the same batch. A
   * plugin's `enable` hook runs after its dependencies are enabled. Unknown
   * names throw unless an `onUnknownPlugin` option is provided. Enabling an
   * already-enabled plugin is a no-op.
   *
   * Bound as a field so it can be passed directly into plugin enable contexts.
   *
   * @param pluginNames - Names of the plugins to enable.
   */
  readonly enablePlugins = async (pluginNames: string[]) => {
    await this.#enablePlugins(new Set(pluginNames))
  }

  /**
   * Enable every plugin named in a single batch.
   *
   * @remarks
   * `toEnable` is the set of plugins explicitly requested by this call. It is
   * threaded down through {@link #enablePlugin} so that optional dependencies
   * are only enabled when they were requested in the *same* batch, and it is
   * registered in {@link #pendingBatches} so that a plugin disabled mid-enable
   * (during a synchronous `enable`) can be removed before it's dispatched.
   *
   * It is deliberately batch-local rather than an instance field: `enablePlugins`
   * is re-entrant and runs its children concurrently, so a shared field would be
   * clobbered by nested/concurrent calls.
   */
  async #enablePlugins(toEnable: Set<string>) {
    this.#pendingBatches.add(toEnable)

    try {
      const promises: Promise<void>[] = []

      for (const pluginName of toEnable) {
        toEnable.delete(pluginName)
        if (this.#enabledPlugins.has(pluginName)) continue

        const plugin = this.#plugins[pluginName]
        if (!plugin) {
          this.#handleUnknownPlugin(pluginName, 'enable')
          continue
        }

        promises.push(this.#enablePlugin(plugin, toEnable))
      }

      await Promise.all(promises)
    } finally {
      this.#pendingBatches.delete(toEnable)
    }
  }

  async #enableOptionalDependencies(plugin: Plugin, toEnable: Set<string>) {
    if (!plugin?.optionalDependencies?.length) return

    const optionalDependencies: string[] = []

    for (const dependencyName of plugin.optionalDependencies) {
      if (
        !this.#enabledPlugins.has(dependencyName) &&
        toEnable.has(dependencyName)
      )
        optionalDependencies.push(dependencyName)
    }

    if (optionalDependencies.length)
      await this.enablePlugins(optionalDependencies)
  }

  /**
   * Disable the named plugins.
   *
   * @remarks
   * By default this removes plugins cautiously: a plugin that is still depended
   * on by another enabled plugin is **not** disabled. Pass `force` to disable a
   * plugin along with everything that depends on it. Disabling a plugin also
   * disables any of its dependencies that nothing else needs (dependencies are
   * never force-disabled). Disabling aborts each removed plugin's `signal`.
   *
   * Unknown names throw unless an `onUnknownPlugin` option is provided.
   *
   * Bound as a field so it can be passed directly into plugin enable contexts.
   *
   * @param pluginNames - Names of the plugins to disable.
   * @param force - When true, also disable plugins that depend on the named ones.
   * @returns The number of plugins actually disabled.
   */
  readonly disablePlugins = (pluginNames: string[], force = false) => {
    return pluginNames.reduce((disabled, pluginName) => {
      const plugin = this.#plugins[pluginName]
      if (!plugin) {
        this.#handleUnknownPlugin(pluginName, 'disable')
        return disabled
      }
      return disabled + this.#disablePlugin(plugin, force)
    }, 0)
  }

  /**
   * Disable every registered plugin (cautiously — see
   * {@link PluginManager.disablePlugins}).
   *
   * @returns The number of plugins actually disabled.
   */
  disableAllPlugins() {
    return this.disablePlugins(Object.keys(this.#plugins))
  }

  #disablePlugin(plugin: Plugin, force: boolean): number {
    let disabled = 0
    // Incase we're disabling plugins during the enable phase, remove it from
    // every in-flight batch so it won't be dispatched.
    for (const batch of this.#pendingBatches) batch.delete(plugin.name)
    if (!this.#enabledPlugins.has(plugin.name)) return disabled
    if (this.#isDependencyOfEnabledPlugin(plugin)) {
      if (force)
        for (const depender of this.#dependencyGraph.dependers(plugin))
          disabled += this.#disablePlugin(depender, force)
      else return disabled
    }
    if (this.#isOptionalDependencyOfEnabledPlugin(plugin)) {
      if (force)
        for (const depender of this.#dependencyGraph.optionalDependers(plugin))
          disabled += this.#disablePlugin(depender, force)
      else return disabled
    }
    this.#enabledPlugins.delete(plugin.name)
    this.#ran.delete(plugin)
    this.#abortControllers.get(plugin)?.abort()
    for (const dep of this.#dependencyGraph.dependencies(plugin))
      disabled += this.#disablePlugin(dep, false) // Never force disable dependencies
    return disabled + 1
  }

  #isDependencyOfEnabledPlugin(dependency: Plugin) {
    for (const plugin of this.#dependencyGraph.dependers(dependency))
      if (this.#enabledPlugins.has(plugin.name)) return true
    return false
  }

  #isOptionalDependencyOfEnabledPlugin(dependency: Plugin) {
    for (const plugin of this.#dependencyGraph.optionalDependers(dependency))
      if (this.#enabledPlugins.has(plugin.name)) return true
    return false
  }

  #getPlugin(pluginName: string) {
    if (!this.#plugins[pluginName])
      throw new Error(`The plugin "${pluginName}" isn't registered.`)
    return this.#plugins[pluginName]
  }

  #handleUnknownPlugin(pluginName: string, phase: 'enable' | 'disable') {
    if (this.#options.onUnknownPlugin)
      this.#options.onUnknownPlugin(pluginName, phase)
    else throw new Error(`The plugin "${pluginName}" isn't registered.`)
  }

  #reportPluginError(error: unknown, plugin: Plugin, phase: 'enable' | 'run') {
    if (this.#options.onPluginError)
      this.#options.onPluginError(error, plugin, phase)
    else console.error(error)
  }

  #abortController(plugin: Plugin) {
    if (!this.#abortControllers.has(plugin)) {
      const abortController = new AbortController()
      abortController.signal.addEventListener(
        'abort',
        () => {
          this.#enabledPlugins.delete(plugin.name)
          this.#ran.delete(plugin)
          this.#abortControllers.delete(plugin)
        },
        { once: true },
      )
      this.#abortControllers.set(plugin, abortController)
    }
    return this.#abortControllers.get(plugin)!
  }

  async #enablePlugin(plugin: Plugin, toEnable: Set<string>) {
    this.#enabledPlugins.add(plugin.name)

    const dependencyPromises: Promise<void>[] = []
    if (plugin.dependencies)
      dependencyPromises.push(this.enablePlugins(plugin.dependencies))
    if (plugin.optionalDependencies)
      dependencyPromises.push(
        this.#enableOptionalDependencies(plugin, toEnable),
      )
    if (dependencyPromises.length) await Promise.all(dependencyPromises)

    if (!plugin.enable) return

    const { signal } = this.#abortController(plugin)
    if (signal.aborted) return

    try {
      await this.#pluginRace(
        plugin,
        () => plugin.enable!(this.#createEnableContext(plugin, signal)),
        plugin.enableTimeout || this.#options.pluginTimeout,
      )
    } catch (error) {
      // Isolate the failure: roll the plugin back so it isn't left marked as
      // enabled, report it, and let sibling plugins carry on.
      this.#enabledPlugins.delete(plugin.name)
      this.#abortControllers.get(plugin)?.abort()
      this.#reportPluginError(error, plugin, 'enable')
    }
  }

  async #runPlugin(plugin: Plugin, path: Set<Plugin> = new Set()) {
    if (path.has(plugin))
      throw new Error(
        `Circular dependency detected: ${[...path, plugin]
          .map((p) => p.name)
          .join(' -> ')}`,
      )

    const nextPath = new Set(path).add(plugin)
    await this.#runDependencies(plugin, nextPath)

    if (this.#ran.has(plugin) || !plugin.run) return

    const { signal } = this.#abortController(plugin)
    if (signal.aborted) return

    this.#ran.add(plugin)

    try {
      await this.#pluginRace(
        plugin,
        () => plugin.run!(this.#createRunContext(plugin, signal)),
        this.#options.pluginTimeout,
      )
    } catch (error) {
      // Isolate the failure so sibling plugins still run.
      this.#reportPluginError(error, plugin, 'run')
    }
  }

  #pluginRace(plugin: Plugin, fn: () => Promise<any>, ms?: number) {
    const { signal } = this.#abortController(plugin)

    return ms === undefined
      ? fn()
      : race(
          (signal) => [
            fn(),
            timeout(ms, signal).then(() => this.disablePlugins([plugin.name])),
          ],
          signal,
        )
  }

  /**
   * Run a plugin's dependencies before the plugin itself: all of its hard
   * dependencies, plus any optional dependency that is currently enabled.
   * Disabled optional dependencies are skipped — they don't gate the run.
   */
  async #runDependencies(plugin: Plugin, path: Set<Plugin>) {
    const dependencies = new Set([
      ...this.#dependencyGraph.dependencies(plugin),
      ...this.#dependencyGraph.optionalDependencies(plugin),
    ])

    const promises: Promise<void>[] = []
    for (const dependency of dependencies)
      if (
        !this.#ran.has(dependency) &&
        this.#enabledPlugins.has(dependency.name)
      )
        promises.push(this.#runPlugin(dependency, path))

    await Promise.all(promises)
  }

  #createEnableContext(plugin: Plugin, signal: AbortSignal) {
    return {
      enablePlugins: this.enablePlugins,
      disablePlugins: this.disablePlugins,
      ...this.#createContext(plugin, signal),
      ...(this.#options.addEnableContext?.(plugin.name) || {}),
    }
  }

  #createRunContext(
    plugin: Plugin,
    signal: AbortSignal,
  ): Record<string, unknown> {
    return {
      ...this.#createContext(plugin, signal),
      ...(this.#options.addRunContext?.(plugin.name) || {}),
    }
  }

  #createContext({ name }: Plugin, signal: AbortSignal) {
    return {
      signal,
      ...(this.#options.addContext?.(name) || {}),
    }
  }
}
