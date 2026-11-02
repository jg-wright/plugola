import type { RunContext, EnableContext } from './Context.js'
import type PluginManager from './PluginManager.js'

/**
 * Resolves to the full enable-context type for a given {@link PluginManager}
 * instance type — {@link EnableContext} intersected with the manager's shared
 * and enable-specific extra context.
 *
 * Useful for typing a plugin's `enable` hook against a concrete manager without
 * restating its context type parameters:
 *
 * ```typescript
 * const pm = new PluginManager({ addContext: () => ({ log }) })
 * type EnableCtx = PluginManagerEnableContext<typeof pm>
 * ```
 */
export type PluginManagerEnableContext<
  PM extends PluginManager<any, any, any>,
> =
  PM extends PluginManager<infer C, infer IC, any>
    ? EnableContext & C & IC
    : never

/**
 * Resolves to the full run-context type for a given {@link PluginManager}
 * instance type — {@link RunContext} intersected with the manager's shared and
 * run-specific extra context. The `run` counterpart to
 * {@link PluginManagerEnableContext}.
 */
export type PluginManagerRunContext<PM extends PluginManager<any, any, any>> =
  PM extends PluginManager<infer C, any, infer RC> ? RunContext & C & RC : never
