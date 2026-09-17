import { timeout } from '@johngw/async'
import { beforeEach, describe, expect, Mock, test, vi } from 'vitest'
import PluginManager from '../src/PluginManager.js'

let pluginManager: PluginManager<{}, {}, {}>

beforeEach(() => {
  pluginManager = new PluginManager() as any
})

test('initializing plugins', async () => {
  let result: string

  pluginManager.registerPlugin('mung', {
    enable() {
      result = 'initializing mung'
    },
  })

  await pluginManager.enableAllPlugins()
  expect(result!).toBe('initializing mung')
})

test('initialize dependency tree', async () => {
  let result: string = ''

  pluginManager.registerPlugin('foo', {
    enable() {
      result += 'foo'
    },
  })

  pluginManager.registerPlugin('bar', {
    dependencies: ['foo'],
    enable() {
      result += 'bar'
    },
  })

  pluginManager.registerPlugin('mung', {
    dependencies: ['bar', 'foo'],
    enable() {
      result += 'mung'
    },
  })

  await pluginManager.enablePlugins(['mung'])
  expect(result).toBe('foobarmung')
})

test('initialize optional dependency tree', async () => {
  let result: string = ''

  pluginManager.registerPlugin('foo', {
    enable() {
      result += 'foo'
    },
  })

  pluginManager.registerPlugin('bar', {
    enable() {
      result += 'bar'
    },
  })

  pluginManager.registerPlugin('mung', {
    optionalDependencies: ['bar', 'foo'],
    enable() {
      result += 'mung'
    },
  })

  await pluginManager.enablePlugins(['mung', 'foo'])
  expect(result).toBe('foomung')
})

test('an optional dependency is enabled before its depender, even alongside hard dependencies', async () => {
  // Regression: enabling a plugin's hard dependencies used to clobber the
  // shared "plugins to enable" set, so an optional dependency requested in the
  // same batch was no longer recognised as one — and the depender's enable()
  // no longer waited for it.
  let optEnabled = false

  pluginManager.registerPlugin('dep', {
    enable() {},
  })

  pluginManager.registerPlugin('opt', {
    async enable() {
      await timeout(10)
      optEnabled = true
    },
  })

  pluginManager.registerPlugin('mung', {
    dependencies: ['dep'],
    optionalDependencies: ['opt'],
    enable() {
      // opt was requested in this batch, so it must be enabled before us.
      expect(optEnabled).toBe(true)
    },
  })

  await pluginManager.enablePlugins(['mung', 'opt'])

  expect(pluginManager.enabledPlugins).toContain('opt')
})

test('running normal plugins', async () => {
  let result: string

  pluginManager.registerPlugin('mung', {
    run() {
      result = 'running mung'
    },
  })

  await pluginManager.enableAllPlugins()
  await pluginManager.run()
  expect(result!).toBe('running mung')
})

test('running with a dependency tree', async () => {
  let result: string = ''

  pluginManager.registerPlugin('foo', {
    run() {
      result += 'foo'
    },
  })

  pluginManager.registerPlugin('bar', {
    dependencies: ['foo'],
    run() {
      result += 'bar'
    },
  })

  pluginManager.registerPlugin('mung', {
    dependencies: ['bar', 'foo'],
    run() {
      result += 'mung'
    },
  })

  await pluginManager.enablePlugins(['mung'])
  await pluginManager.run()
  expect(result).toBe('foobarmung')
})

test('extra context', async () => {
  const pluginManager = new PluginManager({
    addContext(pluginName) {
      return {
        foo: pluginName,
      }
    },

    addEnableContext() {
      return {
        bar: 'bar',
      }
    },

    addRunContext() {
      return {
        mung: 'face',
      }
    },
  })

  pluginManager.registerPlugin('my-plugin', {
    enable({ foo, bar }) {
      expect(foo).toBe('my-plugin')
      expect(bar).toBe('bar')
    },

    run({ foo, mung }) {
      expect(foo).toBe('my-plugin')
      expect(mung).toBe('face')
    },
  })

  await pluginManager.enableAllPlugins()
  await pluginManager.run()
})

test('only run enabled plugins', async () => {
  const foo = vi.fn()
  const bar = vi.fn()

  pluginManager.registerPlugin('foo', {
    run: foo,
  })

  pluginManager.registerPlugin('bar', {
    run: bar,
  })

  await pluginManager.enablePlugins(['foo'])
  await pluginManager.run()

  expect(foo).toHaveBeenCalled()
  expect(bar).not.toHaveBeenCalled()
})

test('enabling plugins within the enable phase', async () => {
  const foo = vi.fn()
  const bar = vi.fn()

  pluginManager.registerPlugin('foo', {
    enable({ enablePlugins }) {
      enablePlugins(['bar'])
    },
    run: foo,
  })

  pluginManager.registerPlugin('bar', {
    run: bar,
  })

  await pluginManager.enablePlugins(['foo'])

  await pluginManager.run()

  expect(foo).toHaveBeenCalled()
  expect(bar).toHaveBeenCalled()
})

describe('disabling plugins', () => {
  let run: Mock

  beforeEach(() => {
    run = vi.fn()

    pluginManager.registerPlugin('rab', {
      run,
    })

    pluginManager.registerPlugin('bar', {
      dependencies: ['rab'],
      run,
    })

    pluginManager.registerPlugin('foo', {
      dependencies: ['bar'],
      run,
    })
  })

  test('disabling plugins within the enable phase', async () => {
    const foo = vi.fn()
    const bar = vi.fn()

    pluginManager.registerPlugin('bar', {
      run: bar,
    })

    pluginManager.registerPlugin('foo', {
      enable({ disablePlugins }) {
        disablePlugins(['bar'])
      },
      run: foo,
    })

    await pluginManager.enablePlugins(['foo', 'bar'])
    await pluginManager.run()

    expect(foo).toHaveBeenCalled()
    expect(bar).not.toHaveBeenCalled()
  })

  test('cleaning up plugins when disabled in the enable phase', async () => {
    const foo = vi.fn()
    const bar = vi.fn()
    const abort = vi.fn()

    pluginManager.registerPlugin('foo', {
      async enable({ disablePlugins, signal }) {
        await timeout(10, signal)
        expect(disablePlugins(['bar'])).toEqual(1)
      },
      run: foo,
    })

    pluginManager.registerPlugin('bar', {
      enable({ signal }) {
        signal.addEventListener('abort', abort)
      },
      run: bar,
    })

    await pluginManager.enablePlugins(['bar', 'foo'])
    await pluginManager.run()

    expect(foo).toHaveBeenCalled()
    expect(abort).toHaveBeenCalled()
    expect(bar).not.toHaveBeenCalled()
  })

  test('disabled a plugin will disable its dependencies', async () => {
    pluginManager.registerPlugin('disabler', {
      enable({ disablePlugins }) {
        disablePlugins(['foo'])
      },
    })

    await pluginManager.enableAllPlugins()
    await pluginManager.run()

    expect(run).not.toHaveBeenCalled()
  })

  test('a plugin will not be removed if its depended on by an enabled plugin', async () => {
    pluginManager.registerPlugin('disabler', {
      enable({ disablePlugins }) {
        disablePlugins(['rab'])
      },
    })

    await pluginManager.enableAllPlugins()
    await pluginManager.run()

    expect(run).toHaveBeenCalledTimes(3)
  })

  test('disabling a plugin will disable only its dependencies that are not dependend on by other plugins', async () => {
    pluginManager.registerPlugin('oof', {
      dependencies: ['rab'],
    })

    pluginManager.registerPlugin('disabler', {
      enable({ disablePlugins }) {
        disablePlugins(['foo'])
      },
    })

    await pluginManager.enableAllPlugins()
    await pluginManager.run()

    expect(pluginManager.enabledPlugins).toHaveLength(3)
    expect(pluginManager.enabledPlugins).toContain('rab')
    expect(pluginManager.enabledPlugins).toContain('oof')
    expect(pluginManager.enabledPlugins).toContain('disabler')
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('force the removal of a plugin and its dependers', async () => {
    pluginManager.registerPlugin('disabler', {
      enable({ disablePlugins }) {
        disablePlugins(['rab'], true)
      },
    })

    await pluginManager.enableAllPlugins()
    await pluginManager.run()

    expect(run).not.toHaveBeenCalled()
  })
})

test('plugins that time out', async () => {
  const abort = vi.fn<(reason: string) => void>()

  pluginManager = new PluginManager({ pluginTimeout: 100 })

  pluginManager.registerPlugin('foo', {
    async enable({ signal }) {
      signal.addEventListener('abort', () => abort('init'))
    },
    async run({ signal }) {
      signal.addEventListener('abort', () => abort('run'))
      await timeout(500, signal)
    },
  })

  await pluginManager.enableAllPlugins()
  await pluginManager.run()

  expect(abort).toHaveBeenCalledTimes(2)
  expect(abort).toHaveBeenCalledWith('init')
  expect(abort).toHaveBeenCalledWith('run')
})

test('replacing context', async () => {
  const run = vi.fn()

  const pluginManager = new PluginManager({
    addContext: () => ({ foo: 'bar' }),
  })

  pluginManager.registerPlugin('fooinizer', {
    run,
  })

  const pluginManagerTest = pluginManager.withOptions({
    addContext: () => ({ foo: 'rab' }),
  })

  await pluginManagerTest.enableAllPlugins()
  await pluginManagerTest.run()
  expect(run).toHaveBeenCalledTimes(1)
  expect(run.mock.calls[0][0].foo).toBe('rab')
})
