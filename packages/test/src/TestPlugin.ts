import type {
  EnableContext,
  Plugin,
  PluginManager,
  RunContext,
} from '@plugola/plugin-manager'

/**
 * Tests a plugin on its own {@link PluginManager}, built from the context
 * callbacks given here.
 */
export interface TestPlugin<
  TestContext extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
  EnableContext extends Record<string, unknown>,
  RunContext extends Record<string, unknown>,
> extends Hooks<TestContext> {
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

/**
 * Tests a plugin on a sibling of an existing {@link PluginManager} (see
 * `PluginManager.prototype.withOptions`), so plugins get the host's context —
 * and its types — with `pluginContext` layered over it. Only the plugin under
 * test and the test's own plugins are enabled.
 */
export interface TestHostPlugin<
  PM extends AnyPluginManager,
  TestContext extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
> extends Hooks<TestContext> {
  pluginManager: PM
  /** The plugin under test, or the name it is already registered under. */
  plugin: string | HostPlugin<PM, TestContext & PluginContext>
  pluginContext?(pluginName: string, testContext: TestContext): PluginContext
  testContext?(): TestContext
  tests: Record<
    string,
    MaybeArray<PartialBy<HostPlugin<PM, TestContext & PluginContext>, 'name'>>
  >
}

interface Hooks<TestContext> {
  afterInit?(testContext: TestContext, initiating: Promise<void>): any
  afterRun?(testContext: TestContext, running: Promise<void>): any
  /** Passed to `run({ onStarted })`, e.g. to resume a paused message bus. */
  onStarted?(testContext: TestContext): void
}

export type AnyPluginManager = PluginManager<any, any, any, any>

/** A plugin of `PM`, whose hooks also receive `Extra`. */
export type HostPlugin<PM extends AnyPluginManager, Extra> =
  PM extends PluginManager<
    infer Context,
    infer ExtraEnable,
    infer ExtraRun,
    infer Meta
  >
    ? Plugin<
        EnableContext & Context & ExtraEnable & Extra,
        RunContext & Context & ExtraRun & Extra
      > &
        Meta
    : never

type MaybeArray<T> = T | T[]

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
