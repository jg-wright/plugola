import { RunContext, EnableContext } from './Context.js'
import { Plugin } from './Plugin.js'
import { race, timeout } from '@johngw/async'
import DependencyGraph from './DependencyGraph.js'

export interface PluginManagerOptions<
  ExtraContext extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
> {
  addContext?(pluginName: string): ExtraContext
  addEnableContext?(pluginName: string): ExtraEnableContext
  addRunContext?(pluginName: string): ExtraRunContext
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

  constructor(
    options: PluginManagerOptions<
      ExtraContext,
      ExtraEnableContext,
      ExtraRunContext
    > = {},
  ) {
    this.#options = options
  }

  get enabledPlugins() {
    return [...this.#enabledPlugins]
  }

  /**
   * Used for testing. This will **replace** parts of the context... not add to it.
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
    pluginManager.#abortControllers = this.#abortControllers
    return pluginManager
  }

  registerPlugin(
    plugin: Plugin<
      EnableContext & ExtraContext & ExtraEnableContext,
      RunContext & ExtraContext & ExtraRunContext
    >,
  ): void

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

  async run() {
    let promises: Promise<void>[] = []
    for (const pluginName of this.#enabledPlugins)
      promises.push(this.#runPlugin(this.#getPlugin(pluginName)))
    await Promise.all(promises)
  }

  async enableAllPlugins() {
    await this.enablePlugins(Object.keys(this.#plugins))
  }

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
   * Disable plugins, by name.
   *
   * @remarks
   * By default, the method will cautiously remove plugins. IE, if they're depended
   * on by other plugins it will **not** be disabled.
   *
   * However, you can force a plugin, and it's dependers, to be disabled by passing
   * the force flag.
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
    await this.#filterMapDependencies(
      plugin,
      (dep) => !this.#ran.has(dep),
      (dep) => this.#runPlugin(dep, nextPath),
    )

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

  async #filterMapDependencies(
    plugin: Plugin,
    filter: (plugin: Plugin) => boolean,
    map: (plugin: Plugin) => Promise<any>,
  ) {
    const promises = []

    for (const dep of this.#dependencyGraph.dependencies(plugin))
      if (filter(dep)) promises.push(map(dep))

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
