import { expect, test, vi } from 'vitest'
import { consentStateFromTCData, tcfConsentSource } from '../src/tcf.js'
import type { TCData, TCFApi } from '../src/tcf.js'

test('consentStateFromTCData', () => {
  expect(
    consentStateFromTCData({
      gdprApplies: true,
      vendor: { consents: { 1: true, 2: false, 3: true } },
      purpose: {
        consents: { 1: true, 2: false },
        legitimateInterests: { 7: true },
      },
      addtlConsent: '1~35.41.101',
    }),
  ).toEqual({
    gdprApplies: true,
    vendors: new Set([1, 3]),
    purposes: new Set([1]),
    legIntPurposes: new Set([7]),
    additionalConsentVendors: new Set([35, 41, 101]),
  })
})

test('waits for the CMP to load consent', async () => {
  const { tcfapi, report } = fakeCMP()
  const source = tcfConsentSource(tcfapi)
  const state = source.get()

  report({ gdprApplies: true, eventStatus: 'cmpuishown' })
  report({
    gdprApplies: true,
    eventStatus: 'useractioncomplete',
    vendor: { consents: { 1: true } },
  })

  expect((await state).vendors).toEqual(new Set([1]))
})

test('consent is known straight away when GDPR does not apply', async () => {
  const { tcfapi, report } = fakeCMP()
  const source = tcfConsentSource(tcfapi)

  report({ gdprApplies: false })

  expect((await source.get()).gdprApplies).toBe(false)
})

test('tells subscribers when consent changes', async () => {
  const { tcfapi, report } = fakeCMP()
  const source = tcfConsentSource(tcfapi)
  const listener = vi.fn()
  source.subscribe!(listener)

  report({ gdprApplies: true, eventStatus: 'tcloaded' })
  expect(listener).not.toHaveBeenCalled()

  report({
    gdprApplies: true,
    eventStatus: 'useractioncomplete',
    vendor: { consents: { 2: true } },
  })
  expect(listener).toHaveBeenCalledTimes(1)
  expect((await source.get()).vendors).toEqual(new Set([2]))
})

function fakeCMP() {
  let callback!: (tcData: TCData | undefined, success: boolean) => void
  const tcfapi: TCFApi = (_command, _version, cb) => {
    callback = cb
  }
  return { tcfapi, report: (tcData: TCData) => callback(tcData, true) }
}
