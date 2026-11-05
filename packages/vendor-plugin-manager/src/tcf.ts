import type { ConsentSource, ConsentState } from './Consent.js'

/**
 * A {@link ConsentSource} backed by an IAB TCF v2 CMP. Consent is known once
 * the CMP reports `tcloaded` or `useractioncomplete` (or that GDPR doesn't
 * apply), and listeners are told about every later change.
 *
 * @param tcfapi - The CMP's `__tcfapi` function.
 */
export function tcfConsentSource(tcfapi: TCFApi): ConsentSource {
  const listeners = new Set<() => void>()
  let state: ConsentState | undefined
  let resolveFirst: (state: ConsentState) => void
  const first = new Promise<ConsentState>((resolve) => {
    resolveFirst = resolve
  })

  tcfapi('addEventListener', 2, (tcData, success) => {
    if (!success || !tcData) return
    if (
      tcData.gdprApplies &&
      tcData.eventStatus !== 'tcloaded' &&
      tcData.eventStatus !== 'useractioncomplete'
    )
      return

    const isFirst = !state
    state = consentStateFromTCData(tcData)
    if (isFirst) resolveFirst(state)
    else for (const listener of listeners) listener()
  })

  return {
    get: () => state ?? first,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Converts the TC data a TCF v2 CMP reports into a {@link ConsentState}.
 */
export function consentStateFromTCData(tcData: TCData): ConsentState {
  return {
    gdprApplies: tcData.gdprApplies !== false,
    vendors: granted(tcData.vendor?.consents),
    purposes: granted(tcData.purpose?.consents),
    legIntPurposes: granted(tcData.purpose?.legitimateInterests),
    additionalConsentVendors: parseAdditionalConsent(tcData.addtlConsent),
  }
}

/** The subset of the IAB TCF v2 TC data the consent gate reads. */
export interface TCData {
  gdprApplies?: boolean
  eventStatus?: string
  vendor?: { consents?: Record<number | string, boolean> }
  purpose?: {
    consents?: Record<number | string, boolean>
    legitimateInterests?: Record<number | string, boolean>
  }
  /** Google Additional Consent string, e.g. `1~1.35.41`. */
  addtlConsent?: string
}

/** The IAB TCF v2 `__tcfapi` function. */
export interface TCFApi {
  (
    command: 'addEventListener',
    version: 2,
    callback: (tcData: TCData | undefined, success: boolean) => void,
  ): void
}

function granted(consents: Record<number | string, boolean> = {}) {
  return new Set(
    Object.entries(consents)
      .filter(([, consented]) => consented)
      .map(([id]) => Number(id)),
  )
}

function parseAdditionalConsent(addtlConsent = '') {
  const [, ids = ''] = addtlConsent.split('~')
  return new Set(
    ids
      .split('.')
      .filter(Boolean)
      .map((id) => Number(id)),
  )
}
