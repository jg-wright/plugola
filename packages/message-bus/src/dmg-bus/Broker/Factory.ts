import type { Bus } from '../Bus.js'
import { BrokerModel } from './BrokerModel.js'
import { BusBroker } from './BusBroker.js'
import { PluginBroker } from './PluginBroker.js'

export function brokerFactory(
  bus: Bus,
  name: string,
): {
  abortSignal: AbortSignal
  busBroker: BusBroker
  pluginBroker: PluginBroker
} {
  const abortController = new AbortController()
  const model = new BrokerModel(bus, name, abortController.signal)
  return {
    abortSignal: abortController.signal,
    busBroker: new BusBroker(model, abortController),
    pluginBroker: new PluginBroker(model, abortController.signal),
  }
}
