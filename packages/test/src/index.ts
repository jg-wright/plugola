import { PluginManager } from '@plugola/plugin-manager'
import type {
  AnyPluginManager,
  HostPlugin,
  TestHostPlugin,
  TestPlugin,
} from './TestPlugin.js'

export type { AnyPluginManager, HostPlugin, TestHostPlugin, TestPlugin }

/**
 * The parts of a test runner that `testPlugin` needs. vitest and `node:test`
 * both fit — see `@plugola/test/vitest` and `@plugola/test/node`.
 */
export interface TestRunner {
  describe(name: string, fn: () => void): unknown
  test(name: string, fn: () => Promise<void>): unknown
  /** Runs once before the tests in the enclosing `describe`. */
  beforeAll(fn: () => void): unknown
  /** Runs once after the tests in the enclosing `describe`. */
  afterAll(fn: () => unknown): unknown
}

/**
 * Declares a `describe` per entry in `tests`, each enabling then running the
 * plugin under test alongside that entry's plugins.
 */
export interface TestPluginFn {
  <
    TestContext extends Record<string, unknown>,
    PluginContext extends Record<string, unknown>,
    EnableContext extends Record<string, unknown>,
    RunContext extends Record<string, unknown>,
  >(
    testPlugin: TestPlugin<
      TestContext,
      PluginContext,
      EnableContext,
      RunContext
    >,
  ): void
  <
    PM extends AnyPluginManager,
    TestContext extends Record<string, unknown>,
    PluginContext extends Record<string, unknown>,
  >(
    testPlugin: TestHostPlugin<PM, TestContext, PluginContext>,
  ): void
}

/** Builds a `testPlugin` that declares its tests with the given runner. */
export function createTestPlugin(runner: TestRunner): TestPluginFn {
  const { describe, test, beforeAll, afterAll } = runner

  return function testPlugin(
    testPlugin:
      | TestPlugin<any, any, any, any>
      | TestHostPlugin<AnyPluginManager, any, any>,
  ) {
    for (const [testName, $plugins] of Object.entries(testPlugin.tests)) {
      const plugins = Array.isArray($plugins) ? $plugins : [$plugins]

      describe(testName, () => {
        let testContext: Record<string, unknown>
        let pluginManager: AnyPluginManager
        let pluginNames: string[]

        beforeAll(() => {
          testContext = testPlugin.testContext?.() ?? {}
          pluginManager = createPluginManager(testPlugin, () => testContext)

          const { plugin } = testPlugin
          if (typeof plugin !== 'string') pluginManager.registerPlugin(plugin)
          pluginNames = [typeof plugin === 'string' ? plugin : plugin.name]

          for (let i = 0; i < plugins.length; i++) {
            const plugin = plugins[i]
            const name = plugin.name ?? `test ${i}`
            pluginManager.registerPlugin({ ...plugin, name })
            pluginNames.push(name)
          }
        })

        afterAll(() => pluginManager.disableAllPlugins())

        test('init', async () => {
          const p = pluginManager.enablePlugins(pluginNames)
          if (testPlugin.afterInit) await testPlugin.afterInit(testContext, p)
          else await p
        })

        test('run', async () => {
          const { onStarted } = testPlugin
          const p = pluginManager.run({
            onStarted: onStarted && (() => onStarted(testContext)),
          })
          if (testPlugin.afterRun) await testPlugin.afterRun(testContext, p)
          else await p
        })
      })
    }
  }
}

function createPluginManager(
  testPlugin:
    TestPlugin<any, any, any, any> | TestHostPlugin<AnyPluginManager, any, any>,
  getTestContext: () => Record<string, unknown>,
): AnyPluginManager {
  const addContext = (pluginName: string) => ({
    ...getTestContext(),
    ...testPlugin.pluginContext?.(pluginName, getTestContext()),
  })

  if ('pluginManager' in testPlugin)
    return testPlugin.pluginManager.withOptions({ addContext, onPluginError })

  return new PluginManager({
    onPluginError,
    addContext,
    addEnableContext: testPlugin.enableContext,
    addRunContext: testPlugin.runContext,
  })
}

/**
 * The plugin manager isolates and logs plugin errors by default, which would
 * swallow a failed assertion; rethrow so `init` / `run` fail instead.
 */
function onPluginError(error: unknown): never {
  throw error
}
