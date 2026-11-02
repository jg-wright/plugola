import type { Gate } from './Gate.js'

/**
 * The base context passed to a plugin's {@link Plugin.run} hook.
 *
 * A typed {@link PluginManager} intersects this with whatever its `addContext`
 * and `addRunContext` options return, so a plugin's `run` receives these fields
 * plus any extras the manager contributes.
 */
export interface RunContext {
  /**
   * Aborts when the plugin is disabled or times out. Long-running work should
   * listen to it (or pass it to abortable APIs) so it can bail out promptly.
   */
  signal: AbortSignal
}

/**
 * The base context passed to a plugin's {@link Plugin.enable} hook.
 *
 * In addition to the fields here, a typed {@link PluginManager} intersects this
 * with whatever its `addContext` and `addEnableContext` options return.
 */
export interface EnableContext {
  /**
   * Aborts when the plugin is disabled or its enable times out.
   */
  signal: AbortSignal
  /**
   * Enable more plugins from within the enable phase. Plugins requested here
   * join the current enable batch, so they can serve as optional dependencies
   * of the enabling plugin.
   */
  enablePlugins(pluginNames: string[], force?: boolean): Promise<void>
  /**
   * Disable plugins from within the enable phase. Returns the number of plugins
   * actually disabled. See {@link PluginManager.disablePlugins} for how `force`
   * and dependency relationships affect what gets removed.
   */
  disablePlugins(pluginNames: string[], force?: boolean): number
  /**
   * Add a {@link Gate} that every plugin must pass before its hooks run. The
   * gate is removed when this plugin is disabled. Returns a function that
   * removes it sooner.
   */
  addGate(gate: Gate<any>): () => void
  /**
   * Whether the named plugin currently passes every gate.
   */
  checkGates(pluginName: string): Promise<boolean>
}

/**
 * What the manager passes to its `add*Context` options alongside the plugin's
 * name.
 */
export interface ContextOptions {
  /**
   * The plugin's signal, which aborts when it is disabled. Useful for tying
   * the lifetime of injected resources to the plugin's.
   */
  signal: AbortSignal
}
