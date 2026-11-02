import { expect, test, vi } from 'vitest'
import VendorPluginManager from '../src/VendorPluginManager.js'
import type { ConsentState } from '../src/Consent.js'

test('only enables and runs consented plugins', async () => {
  const { pluginManager } = setup(new Set([1]))
  const consented = vi.fn()
  const dissented = vi.fn()
  pluginManager.registerPlugin('one', {
    vendorIds: [1],
    purposeIds: 'N/A',
    run: consented,
  })
  pluginManager.registerPlugin('two', {
    vendorIds: [2],
    purposeIds: 'N/A',
    run: dissented,
  })

  await pluginManager.enableAllPlugins()
  await pluginManager.run()

  expect(consented).toHaveBeenCalled()
  expect(dissented).not.toHaveBeenCalled()
})

test('does not enable a vendor plugin just because another plugin depends on it', async () => {
  const { pluginManager } = setup(new Set())
  pluginManager.registerPlugin('vendor', { vendorIds: [1], purposeIds: 'N/A' })
  pluginManager.registerPlugin('always-on', {
    enabledIfDissent: true,
    dependencies: ['vendor'],
  })

  await pluginManager.enablePlugins(['always-on'])

  expect(pluginManager.enabledPlugins).toEqual([])
})

test('disables plugins when consent is withdrawn', async () => {
  const { pluginManager, change } = setup(new Set([1]))
  pluginManager.registerPlugin('one', { vendorIds: [1], purposeIds: 'N/A' })

  await pluginManager.enableAllPlugins()
  expect(pluginManager.enabledPlugins).toEqual(['one'])

  change(new Set())
  await vi.waitFor(() => expect(pluginManager.enabledPlugins).toEqual([]))
})

test('without a consent source, plugins are not gated', async () => {
  const pluginManager = new VendorPluginManager()
  pluginManager.registerPlugin('one', { vendorIds: [1] })

  await pluginManager.enableAllPlugins()

  expect(pluginManager.enabledPlugins).toEqual(['one'])
})

function setup(vendors: Set<number>) {
  const listeners = new Set<() => void>()
  let state = consent(vendors)
  const pluginManager = new VendorPluginManager({
    consent: {
      get: () => state,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  })
  const change = (vendors: Set<number>) => {
    state = consent(vendors)
    for (const listener of listeners) listener()
  }
  return { pluginManager, change }
}

function consent(vendors: Set<number>): ConsentState {
  return {
    gdprApplies: true,
    vendors,
    purposes: new Set(),
    legIntPurposes: new Set(),
    additionalConsentVendors: new Set(),
  }
}
