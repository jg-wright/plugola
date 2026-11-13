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
  /**
   * Never set here; see {@link TestHostPlugin}. Rules this out early, so a
   * host's hooks aren't first typed as if for this.
   */
  pluginManager?: never
  runContext?(pluginName: string): RunContext
  testContext?(): TestContext
  tests: Record<
    string,
    TestEntry<
      PartialBy<
        Plugin<
          TestContext & PluginContext & EnableContext,
          TestContext & PluginContext & RunContext
        >,
        'name'
      >,
      TestContext,
      PluginContext
    >
  >
}

/**
 * Tests a plugin on a sibling of an existing {@link PluginManager} (see
 * `PluginManager.prototype.withOptions`), so plugins get the host's context —
 * and its types — with `pluginContext` layered over it. Only the plugin under
 * test and the test's own plugins are enabled.
 */
export type TestHostPlugin<
  PM extends AnyPluginManager,
  TestContext extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
> =
  PM extends PluginManager<
    infer Context,
    infer ExtraEnableContext,
    infer ExtraRunContext,
    infer PluginMeta
  >
    ? TestHostPluginOf<
        Context,
        ExtraEnableContext,
        ExtraRunContext,
        PluginMeta,
        TestContext,
        PluginContext
      >
    : never

/**
 * {@link TestHostPlugin}, for a host given by its type parameters rather than
 * its type, which lets TypeScript infer every hook's context in one go.
 */
export interface TestHostPluginOf<
  Context extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
  PluginMeta extends object,
  TestContext extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
> extends Hooks<TestContext> {
  pluginManager: PluginManager<
    Context,
    ExtraEnableContext,
    ExtraRunContext,
    PluginMeta
  >
  /** The plugin under test, or the name it is already registered under. */
  plugin:
    | string
    | HostPluginOf<
        Context,
        ExtraEnableContext,
        ExtraRunContext,
        PluginMeta,
        TestContext & PluginContext
      >
  /**
   * Layered over the host's context. Passed the host's context for this
   * plugin, with `testContext` layered over it.
   */
  pluginContext?(
    pluginName: string,
    context: Context & TestContext,
  ): PluginContext
  testContext?(): TestContext
  tests: Record<
    string,
    TestEntry<
      // `PluginMeta` stays outside `PartialBy`: inside it, the mapped type would
      // stay generic and TypeScript would type the hooks before inferring
      // `PluginContext` from `pluginContext`.
      PartialBy<
        HostPluginHooks<
          Context,
          ExtraEnableContext,
          ExtraRunContext,
          TestContext & PluginContext
        >,
        'name'
      > &
        PluginMeta,
      Context & TestContext,
      PluginContext
    >
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
    infer ExtraEnableContext,
    infer ExtraRunContext,
    infer PluginMeta
  >
    ? HostPluginOf<
        Context,
        ExtraEnableContext,
        ExtraRunContext,
        PluginMeta,
        Extra
      >
    : never

/** {@link HostPlugin}, for a host given by its type parameters. */
export type HostPluginOf<
  Context extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
  PluginMeta extends object,
  Extra,
> = HostPluginHooks<Context, ExtraEnableContext, ExtraRunContext, Extra> &
  PluginMeta

/** A host's plugin without its `PluginMeta`. */
type HostPluginHooks<
  Context extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
  Extra,
> = Plugin<
  EnableContext & Context & ExtraEnableContext & Extra,
  RunContext & Context & ExtraRunContext & Extra
>

/**
 * A test's plugins: one, which may also set the test's own `pluginContext`, or
 * several.
 *
 * @typeParam Context - What the top-level `pluginContext` is passed.
 */
export type TestEntry<
  P,
  Context extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
> = (P & TestOptions<Context, PluginContext>) | P[]

/** @typeParam Context - What the top-level `pluginContext` is passed. */
export interface TestOptions<
  Context extends Record<string, unknown>,
  PluginContext extends Record<string, unknown>,
> {
  /**
   * Layered over the top-level `pluginContext` for every plugin in this test,
   * including the plugin under test. Passed the same context as the top-level
   * `pluginContext`.
   */
  pluginContext?(
    pluginName: string,
    context: Context,
  ): NoInfer<Partial<PluginContext>>
}

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
