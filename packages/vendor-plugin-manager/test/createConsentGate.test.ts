import { describe, expect, test, vi } from 'vitest'
import {
  createConsentGate,
  type ConsentGateOptions,
} from '../src/createConsentGate.js'
import type { ConsentState, VendorPluginMeta } from '../src/Consent.js'

describe('createConsentGate', () => {
  test('allows everything when GDPR does not apply', async () => {
    const gate = gateFor({ gdprApplies: false })
    expect(await gate(plugin({}), 'enable')).toBe(true)
  })

  test('allows plugins enabled if dissent', async () => {
    const gate = gateFor({})
    expect(await gate(plugin({ enabledIfDissent: true }), 'enable')).toBe(true)
  })

  test('refuses plugins that do not declare their vendors or purposes', async () => {
    const onRefused = vi.fn()
    const gate = gateFor({}, onRefused)

    expect(await gate(plugin({ purposeIds: 'N/A' }), 'enable')).toBe(false)
    expect(onRefused).toHaveBeenLastCalledWith(expect.anything(), {
      reason: 'undeclared',
      field: 'vendorIds',
    })

    expect(await gate(plugin({ vendorIds: 'N/A' }), 'enable')).toBe(false)
    expect(onRefused).toHaveBeenLastCalledWith(expect.anything(), {
      reason: 'undeclared',
      field: 'purposeIds',
    })
  })

  test('allows plugins whose restrictions do not apply', async () => {
    const gate = gateFor({})
    expect(
      await gate(plugin({ vendorIds: 'N/A', purposeIds: 'N/A' }), 'enable'),
    ).toBe(true)
  })

  test.each<[string, VendorPluginMeta, Partial<ConsentState>, number[]]>([
    [
      'vendors',
      { vendorIds: [1, 2], purposeIds: 'N/A' },
      { vendors: new Set([1]) },
      [2],
    ],
    [
      'purposes',
      { vendorIds: 'N/A', purposeIds: [1, 3] },
      { purposes: new Set([1]) },
      [3],
    ],
    [
      'legIntPurposes',
      { vendorIds: 'N/A', purposeIds: 'N/A', legIntPurposeIds: [7] },
      {},
      [7],
    ],
    [
      'additionalConsentVendors',
      { vendorIds: 'N/A', purposeIds: 'N/A', additionalConsentVendorIds: [89] },
      {},
      [89],
    ],
  ])(
    'refuses plugins missing consent to %s',
    async (reason, meta, consent, ids) => {
      const onRefused = vi.fn()
      const gate = gateFor(consent, onRefused)
      expect(await gate(plugin(meta), 'enable')).toBe(false)
      expect(onRefused).toHaveBeenCalledWith(expect.anything(), { reason, ids })
    },
  )

  test('allows plugins with full consent', async () => {
    const gate = gateFor({
      vendors: new Set([1, 2]),
      purposes: new Set([1, 3]),
      legIntPurposes: new Set([7]),
      additionalConsentVendors: new Set([89]),
    })
    expect(
      await gate(
        plugin({
          vendorIds: [1, 2],
          purposeIds: [1, 3],
          legIntPurposeIds: [7],
          additionalConsentVendorIds: [89],
        }),
        'enable',
      ),
    ).toBe(true)
  })

  test('waits for consent to be known', async () => {
    let resolve!: (state: ConsentState) => void
    const gate = createConsentGate({
      get: () => new Promise((r) => (resolve = r)),
    })
    const result = gate(plugin({ vendorIds: [1], purposeIds: 'N/A' }), 'enable')
    resolve(consent({ vendors: new Set([1]) }))
    expect(await result).toBe(true)
  })
})

function gateFor(
  state: Partial<ConsentState>,
  onRefused?: ConsentGateOptions['onRefused'],
) {
  return createConsentGate({ get: () => consent(state) }, { onRefused })
}

function plugin(meta: VendorPluginMeta) {
  return { name: 'test', ...meta }
}

function consent(state: Partial<ConsentState>): ConsentState {
  return {
    gdprApplies: true,
    vendors: new Set(),
    purposes: new Set(),
    legIntPurposes: new Set(),
    additionalConsentVendors: new Set(),
    ...state,
  }
}
