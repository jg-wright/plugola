import type { L } from 'ts-toolbelt'
import type { InvokablesDict } from '@plugola/invoke'
import type Broker from '../Broker.js'
import type MessageBus from '../MessageBus.js'
import type MessageBusError from '../MessageBusError.js'
import type { EventsT } from './events.js'
import type { EventGeneratorsT } from './generators.js'
import type { StreamsDict } from './streams.js'

export interface Unsubscriber {
  (): void
}

export type AddAbortSignal<Args extends unknown[]> = L.Append<Args, AbortSignal>

/**
 * The single "bag" of type information a {@link MessageBus} (and its
 * {@link Broker}) is configured with. Adding a new feature means adding a
 * property here rather than appending a positional generic to every reference.
 */
export interface MessageBusContext {
  events: EventsT
  generators: EventGeneratorsT
  invokables: InvokablesDict
  streams: StreamsDict
}

/**
 * Build a {@link MessageBusContext} from a partial one, defaulting any slot the
 * consumer doesn't specify.
 *
 * @example
 * type Ctx = CreateMessageBusContext<{ events: { foo: [string] } }>
 * let bus: MessageBus<Ctx>
 */
export type CreateMessageBusContext<C extends Partial<MessageBusContext> = {}> =
  Omit<MessageBusContext, keyof C> & C

export interface ErrorHandler {
  (error: MessageBusError): any
}
