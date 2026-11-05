# @plugola/vendor-plugin-manager

A [`@plugola/plugin-manager`](../plugin-manager) that only enables and runs the
plugins a user has consented to, in IAB TCF v2 terms.

## Installation

```sh
npm install @plugola/plugin-manager @plugola/vendor-plugin-manager
```

## Declaring consent

Each plugin declares the consent it needs:

| Field                        | Meaning                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `vendorIds`                  | IAB vendors the plugin shares data with. **Required.**          |
| `purposeIds`                 | IAB purposes the plugin needs consent for. **Required.**        |
| `legIntPurposeIds`           | IAB purposes the plugin relies on legitimate interest for.      |
| `additionalConsentVendorIds` | Google Additional Consent (ATP) providers the plugin needs.     |
| `enabledIfDissent`           | Allow the plugin whatever the user consented to (e.g. the CMP). |

Use `'N/A'` when a restriction doesn't apply. While GDPR applies, a plugin that
doesn't declare its `vendorIds` and `purposeIds` is refused.

## Usage

Give the manager a consent source. `tcfConsentSource` reads it from a TCF v2
CMP. Plugins are held back until consent is known, and disabled if it's
withdrawn.

```typescript
import {
  VendorPluginManager,
  tcfConsentSource,
} from '@plugola/vendor-plugin-manager'

const pluginManager = new VendorPluginManager({
  consent: tcfConsentSource(window.__tcfapi),
  onRefused(plugin, refusal) {
    console.info(`${plugin.name} refused`, refusal)
  },
})

pluginManager.registerPlugin('analytics', {
  vendorIds: [77],
  purposeIds: [1, 8],
  run() {},
})

pluginManager.registerPlugin('cmp', { enabledIfDissent: true, run() {} })

await pluginManager.enableAllPlugins()
await pluginManager.run()
```

Plugins are gated before both `enable` and `run`, and a plugin that depends on
a refused plugin isn't enabled either.

### Your own consent source

A `ConsentSource` is `{ get(), subscribe?(listener) }`. `get` returns the
`ConsentState`, or a promise of it while consent isn't known.
`consentStateFromTCData` converts TCF v2 TC data into a `ConsentState`.

### Adding the gate later

When consent can only be known once a plugin has started (for example a CMP
that is itself a plugin), leave out `consent` and add the gate from that
plugin. The gate applies from then on.

```typescript
import { createConsentGate } from '@plugola/vendor-plugin-manager'

pluginManager.registerPlugin('cmp', {
  enabledIfDissent: true,
  enable({ addGate }) {
    addGate(createConsentGate({ get: () => consentFromMyCMP() }))
  },
})
```
