import type { Plugin } from '@plugola/plugin-manager'

export interface TestPlugin<
  TestContext extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
  EnableContext extends Record<string, unknown>,
  RunContext extends Record<string, unknown>,
> {
  afterRun?(testContext: TestContext): any
  enableContext?(pluginName: string): EnableContext
  pluginContext?(pluginName: string): PluginContext
  runContext?(pluginName: string): RunContext
  testContext?(): TestContext
  tests: Record<
    string,
    Plugin<
      TestContext & PluginContext & EnableContext,
      TestContext & PluginContext & RunContext
    >[]
  >
}
