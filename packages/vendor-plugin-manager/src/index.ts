import { updateMap } from '@johngw/map'
import {
  PluginManager,
  type EnableContext,
  type Plugin,
  type RunContext,
} from '@plugola/plugin-manager'

export default class VendorPluginManager<
  ExtraContext extends Record<string, unknown>,
  ExtraEnableContext extends Record<string, unknown>,
  ExtraRunContext extends Record<string, unknown>,
> extends PluginManager<ExtraContext, ExtraEnableContext, ExtraRunContext> {
  #automaticallyAuthorizedPlugins = new Set<string>()
  #vendors: Map<number, string[]> = new Map()

  override registerPlugin(
    plugin: Plugin<
      EnableContext & ExtraContext & ExtraEnableContext,
      RunContext & ExtraContext & ExtraRunContext
    >,
  ): void

  override registerPlugin(
    name: string,
    plugin: Omit<
      Plugin<
        EnableContext & ExtraContext & ExtraEnableContext,
        RunContext & ExtraContext & ExtraRunContext
      >,
      'name'
    >,
  ): void

  override registerPlugin(
    nameOrPlugin:
      | string
      | Plugin<
          EnableContext & ExtraContext & ExtraEnableContext,
          RunContext & ExtraContext & ExtraRunContext
        >,
    plugin?: Omit<
      Plugin<
        EnableContext & ExtraContext & ExtraEnableContext,
        RunContext & ExtraContext & ExtraRunContext
      >,
      'name'
    >,
  ) {
    super.registerPlugin(
      nameOrPlugin as string,
      plugin as Omit<
        Plugin<
          EnableContext & ExtraContext & ExtraEnableContext,
          RunContext & ExtraContext & ExtraRunContext
        >,
        'name'
      >,
    )

    const name = plugin
      ? (nameOrPlugin as string)
      : (
          nameOrPlugin as Plugin<
            EnableContext & ExtraContext & ExtraEnableContext,
            RunContext & ExtraContext & ExtraRunContext
          >
        ).name

    this.#automaticallyAuthorizedPlugins.add(name)
  }

  registerVendorPlugin(
    name: string,
    vendorIds: number[],
    plugin: Omit<
      Plugin<
        EnableContext & ExtraContext & ExtraEnableContext,
        RunContext & ExtraContext & ExtraRunContext
      >,
      'name'
    >,
  ) {
    super.registerPlugin(name, plugin)
    this.#relatedPluginAndVendorIds(name, vendorIds)
  }

  async enableAuthorizedPlugins(authorizedVendorIds: number[]) {
    await this.enablePlugins([
      ...this.#automaticallyAuthorizedPlugins,
      ...authorizedVendorIds.reduce<string[]>(
        (pluginNames, vendorId) =>
          this.#vendors.has(vendorId)
            ? [...pluginNames, ...this.#vendors.get(vendorId)!]
            : pluginNames,
        [],
      ),
    ])
  }

  #relatedPluginAndVendorIds(pluginName: string, vendorIds: number[]) {
    for (const vendorId of vendorIds)
      this.#vendors = updateMap(this.#vendors, vendorId, (pluginNames = []) => [
        ...pluginNames,
        pluginName,
      ])
  }
}
