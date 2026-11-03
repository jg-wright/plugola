import { describe, expect, test, vi } from 'vitest'
import PluginManager from '../src/PluginManager.js'
import type { Gate } from '../src/Gate.js'

interface Meta {
  vendor?: number
}

describe('gates', () => {
  test('a refused plugin is neither enabled nor run', async () => {
    const pm = manager({ gates: [allowVendors()] })
    const enable = vi.fn()
    const run = vi.fn()
    pm.registerPlugin('ads', { vendor: 1, enable, run })

    await pm.enablePlugins(['ads'])
    await pm.run()

    expect(enable).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(pm.enabledPlugins).toEqual([])
  })

  test('an allowed plugin is enabled and run', async () => {
    const pm = manager({ gates: [allowVendors(1)] })
    const enable = vi.fn()
    const run = vi.fn()
    pm.registerPlugin('ads', { vendor: 1, enable, run })

    await pm.enablePlugins(['ads'])
    await pm.run()

    expect(enable).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('gates are told the phase and receive plugin metadata', async () => {
    const gate = vi.fn<Gate<any>>(() => true)
    const pm = manager({ gates: [gate] })
    pm.registerPlugin('ads', { vendor: 1, run() {} })

    await pm.enablePlugins(['ads'])
    await pm.run()

    expect(gate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'ads', vendor: 1 }),
      'enable',
    )
    expect(gate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'ads' }),
      'run',
    )
  })

  test('async gates are awaited', async () => {
    let allow!: (allowed: boolean) => void
    const pm = manager({
      gates: [() => new Promise<boolean>((resolve) => (allow = resolve))],
    })
    const enable = vi.fn()
    pm.registerPlugin('ads', { enable })

    const enabling = pm.enablePlugins(['ads'])
    await Promise.resolve()
    expect(enable).not.toHaveBeenCalled()

    allow(true)
    await enabling
    expect(enable).toHaveBeenCalledTimes(1)
  })

  test('run onStarted waits for async gates, counting refused plugins', async () => {
    let consented = true
    const pm = manager({
      gates: [async ({ vendor }) => vendor === undefined || consented],
    })
    const events: string[] = []
    pm.registerPlugin('ads', {
      vendor: 1,
      run: () => {
        events.push('ads invoked')
      },
    })
    pm.registerPlugin('tracking', {
      run: () => {
        events.push('tracking invoked')
      },
    })

    await pm.enablePlugins(['ads', 'tracking'])
    consented = false // ads is refused before run
    await pm.run({ onStarted: () => events.push('started') })

    expect(events).toEqual(['tracking invoked', 'started'])
  })

  test('a plugin is not enabled when its dependency is refused', async () => {
    const pm = manager({ gates: [allowVendors()] })
    const enable = vi.fn()
    pm.registerPlugin('vendor', { vendor: 1 })
    pm.registerPlugin('always-on', { dependencies: ['vendor'], enable })

    await pm.enablePlugins(['always-on'])

    expect(enable).not.toHaveBeenCalled()
    expect(pm.enabledPlugins).toEqual([])
  })

  test('a gate added during the enable phase applies from then on', async () => {
    const pm = manager()
    const runFirst = vi.fn()
    const runSecond = vi.fn()
    pm.registerPlugin('cmp', {
      enable({ addGate }) {
        addGate(allowVendors())
      },
    })
    pm.registerPlugin('first', { vendor: 1, run: runFirst })
    pm.registerPlugin('second', { vendor: 2, run: runSecond })

    await pm.enablePlugins(['first'])
    await pm.enablePlugins(['cmp'])
    await pm.enablePlugins(['second'])
    expect(pm.enabledPlugins).toEqual(['first', 'cmp'])

    await pm.run()
    expect(runFirst).not.toHaveBeenCalled()
    expect(pm.enabledPlugins).toEqual(['cmp'])
  })

  test('a gate added from a plugin is removed when that plugin is disabled', async () => {
    const pm = manager()
    pm.registerPlugin('cmp', {
      enable({ addGate }) {
        addGate(allowVendors())
      },
    })
    pm.registerPlugin('ads', { vendor: 1 })

    await pm.enablePlugins(['cmp'])
    pm.disablePlugins(['cmp'])
    await pm.enablePlugins(['ads'])

    expect(pm.enabledPlugins).toEqual(['ads'])
  })

  test('addGate returns a function that removes the gate', async () => {
    const pm = manager()
    const removeGate = pm.addGate(allowVendors())
    pm.registerPlugin('ads', { vendor: 1 })

    removeGate()
    await pm.enablePlugins(['ads'])

    expect(pm.enabledPlugins).toEqual(['ads'])
  })

  test('checkGates', async () => {
    const pm = manager({ gates: [allowVendors(1)] })
    pm.registerPlugin('one', { vendor: 1 })
    pm.registerPlugin('two', { vendor: 2 })

    expect(await pm.checkGates('one')).toBe(true)
    expect(await pm.checkGates('two')).toBe(false)
  })

  test('recheckGates disables plugins that no longer pass, with their dependers', async () => {
    const allowed = new Set([1])
    const pm = manager({
      gates: [({ vendor }) => vendor === undefined || allowed.has(vendor)],
    })
    const onAbort = vi.fn()
    pm.registerPlugin('vendor', {
      vendor: 1,
      enable({ signal }) {
        signal.addEventListener('abort', onAbort)
      },
    })
    pm.registerPlugin('depender', { dependencies: ['vendor'] })
    pm.registerPlugin('other', {})

    await pm.enablePlugins(['depender', 'other'])
    expect(pm.enabledPlugins.sort()).toEqual(['depender', 'other', 'vendor'])

    allowed.clear()
    expect(await pm.recheckGates()).toEqual(['vendor'])
    expect(pm.enabledPlugins).toEqual(['other'])
    expect(onAbort).toHaveBeenCalled()
  })

  test('a gate that throws refuses the plugin and is reported', async () => {
    const onPluginError = vi.fn()
    const error = new Error('nope')
    const pm = manager({
      gates: [
        () => {
          throw error
        },
      ],
      onPluginError,
    })
    pm.registerPlugin('ads', {})

    await pm.enablePlugins(['ads'])

    expect(pm.enabledPlugins).toEqual([])
    expect(onPluginError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ name: 'ads' }),
      'enable',
    )
  })

  test('onPluginGated is told about refused plugins', async () => {
    const onPluginGated = vi.fn()
    const pm = manager({ gates: [allowVendors()], onPluginGated })
    pm.registerPlugin('ads', { vendor: 1 })

    await pm.enablePlugins(['ads'])

    expect(onPluginGated).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ads' }),
      'enable',
    )
  })

  test('withOptions keeps the gates', async () => {
    const pm = manager({ gates: [allowVendors()] }).withOptions({})
    pm.registerPlugin('ads', { vendor: 1 })

    await pm.enablePlugins(['ads'])

    expect(pm.enabledPlugins).toEqual([])
  })
})

describe('context options', () => {
  test('add*Context receive the plugin signal', async () => {
    const signals: AbortSignal[] = []
    const pm = new PluginManager({
      addContext: (_, { signal }) => {
        signals.push(signal)
        return {}
      },
      addEnableContext: (_, { signal }) => {
        signals.push(signal)
        return {}
      },
      addRunContext: (_, { signal }) => {
        signals.push(signal)
        return {}
      },
    })
    let enableSignal!: AbortSignal
    pm.registerPlugin('ads', {
      enable({ signal }) {
        enableSignal = signal
      },
      run() {},
    })

    await pm.enablePlugins(['ads'])
    await pm.run()

    expect(signals).toHaveLength(4)
    for (const signal of signals) expect(signal).toBe(enableSignal)
  })
})

function manager(
  options: ConstructorParameters<
    typeof PluginManager<{}, {}, {}, Meta>
  >[0] = {},
) {
  return new PluginManager<{}, {}, {}, Meta>(options)
}

function allowVendors(...vendors: number[]): Gate<{ name: string } & Meta> {
  return ({ vendor }) => vendor === undefined || vendors.includes(vendor)
}
