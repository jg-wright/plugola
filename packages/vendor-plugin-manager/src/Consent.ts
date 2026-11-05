/**
 * Where a {@link createConsentGate consent gate} gets the user's consent from.
 */
export interface ConsentSource {
  /**
   * The current consent. Return a promise while consent isn't known yet; the
   * gate holds plugins back until it resolves.
   */
  get(): ConsentState | Promise<ConsentState>
  /**
   * Called whenever consent changes, so a {@link VendorPluginManager} can
   * re-check its plugins. Returns a function that unsubscribes.
   */
  subscribe?(listener: () => void): () => void
}

/**
 * The user's consent, in IAB TCF terms.
 */
export interface ConsentState {
  /** When `false`, consent isn't required and every plugin is allowed. */
  gdprApplies: boolean
  /** IAB vendor IDs the user consented to. */
  vendors: ReadonlySet<number>
  /** IAB purpose IDs the user consented to. */
  purposes: ReadonlySet<number>
  /** IAB purpose IDs the user didn't object to on legitimate interest. */
  legIntPurposes: ReadonlySet<number>
  /** Google Additional Consent (ATP) provider IDs the user consented to. */
  additionalConsentVendors: ReadonlySet<number>
}

/**
 * What a plugin declares about the consent it needs. `'N/A'` means the
 * restriction doesn't apply to it.
 */
export interface VendorPluginMeta {
  /**
   * The IAB vendors the plugin shares data with. Required while GDPR applies:
   * a plugin that doesn't declare them is refused.
   */
  vendorIds?: number[] | 'N/A'
  /**
   * The IAB purposes the plugin needs consent for. Required while GDPR
   * applies: a plugin that doesn't declare them is refused.
   */
  purposeIds?: number[] | 'N/A'
  /** The IAB purposes the plugin relies on legitimate interest for. */
  legIntPurposeIds?: number[] | 'N/A'
  /** The Google Additional Consent (ATP) providers the plugin needs. */
  additionalConsentVendorIds?: number[] | 'N/A'
  /** Allow the plugin whatever the user consented to. */
  enabledIfDissent?: boolean
}
