import { PluginManager } from '@plugola/plugin-manager'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { TestPlugin } from './TestPlugin.js'

export { TestPlugin }

export function testPlugin<
  TestContext extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
  EnableContext extends Record<string, unknown>,
  RunContext extends Record<string, unknown>,
>(
  testPlugin: TestPlugin<TestContext, PluginContext, EnableContext, RunContext>,
) {
  for (const [testName, plugins] of Object.entries(testPlugin.tests)) {
    describe(testName, () => {
      let testContext: TestContext

      let pluginManager: PluginManager<
        TestContext & PluginContext,
        EnableContext,
        RunContext
      >

      beforeAll(() => {
        testContext = testPlugin.testContext?.() ?? ({} as TestContext)

        pluginManager = new PluginManager({
          addContext(pluginName) {
            return {
              ...testContext,
              ...testPlugin.pluginContext?.(pluginName, testContext),
            } as TestContext & PluginContext
          },
          addEnableContext: testPlugin.enableContext,
          addRunContext: testPlugin.runContext,
        })

        for (const plugin of plugins) pluginManager.registerPlugin(plugin)
      })

      afterAll(() => pluginManager.disableAllPlugins())

      test('init', async () => {
        const p = pluginManager.enableAllPlugins()
        if (testPlugin.afterInit) await testPlugin.afterInit(p, testContext)
        else await p
      })

      test('run', async () => {
        const p = pluginManager.run()
        if (testPlugin.afterRun) await testPlugin.afterRun(p, testContext)
        else await p
      })
    })
  }
}
