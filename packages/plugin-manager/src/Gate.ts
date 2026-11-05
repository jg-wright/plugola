import type { Plugin } from './Plugin.js'

/**
 * Decides whether a plugin may proceed to a lifecycle hook. Every gate must
 * allow a plugin before its `enable` or `run` hook is called; a plugin a gate
 * refuses is rolled back (and, if refused before `run`, disabled along with its
 * dependers). Gates may be async.
 *
 * Gates only apply from the moment they are added, so a gate added part way
 * through the enable phase doesn't affect plugins that were already enabled
 * until they reach `run`, or until {@link PluginManager.recheckGates}.
 *
 * @typeParam P - The plugin shape, including any metadata the manager's plugins
 * carry (see the manager's `PluginMeta` type parameter).
 */
export interface Gate<P extends Plugin<any, any> = Plugin<any, any>> {
  (plugin: P, phase: GatePhase): boolean | Promise<boolean>
}

export type GatePhase = 'enable' | 'run'
