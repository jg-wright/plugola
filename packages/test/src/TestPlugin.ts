import type { Plugin } from '@plugola/plugin-manager'

export interface TestPlugin<
  TestContext extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
  EnableContext extends Record<string, unknown>,
  RunContext extends Record<string, unknown>,
> {
  afterInit?(testContext: TestContext, initiating: Promise<void>): any
  afterRun?(testContext: TestContext, running: Promise<void>): any
  enableContext?(pluginName: string): EnableContext
  pluginContext?(pluginName: string, testContext: TestContext): PluginContext
  plugin: Plugin<
    TestContext & PluginContext & EnableContext,
    TestContext & PluginContext & RunContext
  >
  runContext?(pluginName: string): RunContext
  testContext?(): TestContext
  tests: Record<
    string,
    MaybeArray<
      PartialBy<
        Plugin<
          TestContext & PluginContext & EnableContext,
          TestContext & PluginContext & RunContext
        >,
        'name'
      >
    >
  >
}

type MaybeArray<T> = T | T[]

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
