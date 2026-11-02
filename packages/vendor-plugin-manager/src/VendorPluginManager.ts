import {
  PluginManager,
  type PluginManagerOptions,
} from '@plugola/plugin-manager'
import type { ConsentSource, VendorPluginMeta } from './Consent.js'
import {
  createConsentGate,
  type ConsentGateOptions,
} from './createConsentGate.js'

/**
 * A {@link PluginManager} whose plugins declare the consent they need (see
 * {@link VendorPluginMeta}).
 *
 * Given a `consent` source, it only enables and runs the plugins the user has
 * consented to, and disables the ones whose consent is withdrawn. Without one,
 * add a gate from {@link createConsentGate} yourself once consent can be known,
 * for example from a CMP plugin's `enable` hook.
 *
 * @example
 * ```typescript
 * const pluginManager = new VendorPluginManager({
 *   consent: tcfConsentSource(window.__tcfapi),
 * })
 *
 * pluginManager.registerPlugin('analytics', {
 *   vendorIds: [77],
 *   purposeIds: [1, 8],
 *   run() {},
 * })
 * ```
 */
export default class VendorPluginManager<
  ExtraContext extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
  PluginMeta extends object = {},
> extends PluginManager<
  ExtraContext,
  ExtraEnableContext,
  ExtraRunContext,
  PluginMeta & VendorPluginMeta
> {
  constructor({
    consent,
    onRefused,
    ...options
  }: VendorPluginManagerOptions<
    ExtraContext,
    ExtraEnableContext,
    ExtraRunContext,
    PluginMeta
  > = {}) {
    super(options)
    if (!consent) return
    this.addGate(createConsentGate(consent, { onRefused }))
    consent.subscribe?.(() => {
      this.recheckGates()
    })
  }
}

export interface VendorPluginManagerOptions<
  ExtraContext extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
  PluginMeta extends object = {},
>
  extends
    PluginManagerOptions<
      ExtraContext,
      ExtraEnableContext,
      ExtraRunContext,
      PluginMeta & VendorPluginMeta
    >,
    ConsentGateOptions {
  /** Where to get the user's consent from. */
  consent?: ConsentSource
}
