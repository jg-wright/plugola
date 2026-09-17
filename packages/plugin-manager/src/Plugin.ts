/**
 * A unit of work registered with a {@link PluginManager}.
 *
 * A plugin has two optional lifecycle hooks — {@link Plugin.enable} and
 * {@link Plugin.run} — and declares its relationships to other plugins through
 * {@link Plugin.dependencies} and {@link Plugin.optionalDependencies}. The
 * manager uses those relationships to order the hooks: a plugin's dependencies
 * are always enabled/run before the plugin itself.
 *
 * @typeParam EC - The context object passed to {@link Plugin.enable}. Defaults
 * to a plain record; a typed manager narrows it to
 * {@link EnableContext} plus whatever the manager's `addContext` /
 * `addEnableContext` options contribute.
 * @typeParam RC - The context object passed to {@link Plugin.run}, likewise
 * narrowed by a typed manager to {@link RunContext} plus its extra context.
 */
export interface Plugin<
  EC extends Record<string, unknown> = Record<string, unknown>,
  RC extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Unique name the plugin is registered and referenced under. */
  name: string
  /**
   * Names of plugins that must be enabled and run before this one. Enabling
   * this plugin enables its dependencies automatically; disabling this plugin
   * may disable dependencies that nothing else needs.
   */
  dependencies?: string[]
  /**
   * Names of plugins that this plugin can make use of but does not require. An
   * optional dependency only affects ordering when it is *also* enabled — and,
   * at enable time, only when it was requested in the same
   * {@link PluginManager.enablePlugins} batch as this plugin.
   */
  optionalDependencies?: string[]
  /**
   * Milliseconds to wait for {@link Plugin.enable} before aborting it. Overrides
   * the manager's `pluginTimeout` for the enable hook. When the timeout fires the
   * plugin is disabled and its `signal` aborts.
   */
  enableTimeout?: number
  /**
   * Called once when the plugin is enabled, after its dependencies are enabled.
   * May be async. Receives the enable context, which includes an `AbortSignal`
   * plus `enablePlugins` / `disablePlugins` for changing the active plugin set
   * from within the enable phase.
   */
  enable?(context: EC): any
  /**
   * Called once when {@link PluginManager.run} is invoked, after the plugin's
   * dependencies (and enabled optional dependencies) have run. May be async.
   */
  run?(context: RC): any
}
