export {
  default,
  default as VendorPluginManager,
  type VendorPluginManagerOptions,
} from './VendorPluginManager.js'
export {
  createConsentGate,
  type ConsentGateOptions,
  type ConsentRefusal,
} from './createConsentGate.js'
export {
  consentStateFromTCData,
  tcfConsentSource,
  type TCData,
  type TCFApi,
} from './tcf.js'
export type {
  ConsentSource,
  ConsentState,
  VendorPluginMeta,
} from './Consent.js'
