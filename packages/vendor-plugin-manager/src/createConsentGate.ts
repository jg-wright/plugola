import type { Gate, Plugin } from '@plugola/plugin-manager'
import type {
  ConsentSource,
  ConsentState,
  VendorPluginMeta,
} from './Consent.js'

/**
 * Creates a {@link Gate} that only allows plugins the user has consented to.
 *
 * While GDPR applies, a plugin is allowed when it's marked
 * {@link VendorPluginMeta.enabledIfDissent}, or when the user consented to
 * every vendor, purpose and Additional Consent provider it declares and didn't
 * object to any legitimate interest purpose it declares. A plugin must declare
 * its `vendorIds` and `purposeIds` (`'N/A'` if they don't apply); one that
 * doesn't is refused.
 */
export function createConsentGate(
  source: ConsentSource,
  { onRefused }: ConsentGateOptions = {},
): Gate<Plugin<any, any> & VendorPluginMeta> {
  return async (plugin) => {
    if (plugin.enabledIfDissent) return true

    const consent = await source.get()
    if (!consent.gdprApplies) return true

    const refusal = findRefusal(plugin, consent)
    if (refusal) onRefused?.(plugin, refusal)
    return !refusal
  }
}

export interface ConsentGateOptions {
  /** Told why a plugin was refused, for logging. */
  onRefused?(
    plugin: Plugin<any, any> & VendorPluginMeta,
    refusal: ConsentRefusal,
  ): void
}

export type ConsentRefusal =
  | { reason: 'undeclared'; field: 'vendorIds' | 'purposeIds' }
  | {
      reason:
        | 'vendors'
        | 'purposes'
        | 'legIntPurposes'
        | 'additionalConsentVendors'
      ids: number[]
    }

function findRefusal(
  plugin: VendorPluginMeta,
  consent: ConsentState,
): ConsentRefusal | undefined {
  if (plugin.vendorIds === undefined)
    return { reason: 'undeclared', field: 'vendorIds' }
  if (plugin.purposeIds === undefined)
    return { reason: 'undeclared', field: 'purposeIds' }

  const checks = [
    ['vendors', plugin.vendorIds, consent.vendors],
    ['purposes', plugin.purposeIds, consent.purposes],
    ['legIntPurposes', plugin.legIntPurposeIds, consent.legIntPurposes],
    [
      'additionalConsentVendors',
      plugin.additionalConsentVendorIds,
      consent.additionalConsentVendors,
    ],
  ] as const

  for (const [reason, required, granted] of checks) {
    const ids = missing(required, granted)
    if (ids.length) return { reason, ids }
  }

  return undefined
}

function missing(
  required: number[] | 'N/A' | undefined,
  granted: ReadonlySet<number>,
) {
  return Array.isArray(required)
    ? required.filter((id) => !granted.has(id))
    : []
}
