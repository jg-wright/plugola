import { InvokablesDict } from '@plugola/invoke'
import MessageBus from '../MessageBus.js'
import { EventsT } from '../types/events.js'
import { EventGeneratorsT } from '../types/generators.js'
import { StreamsDict } from '../types/streams.js'

export class InvokableNotRegisteredError<
  Events extends EventsT,
  EventGens extends EventGeneratorsT,
  Invokables extends InvokablesDict,
  Streamables extends StreamsDict = StreamsDict,
> extends Error {
  #messageBus: MessageBus<Events, EventGens, Invokables, Streamables>
  #invokableName: string

  constructor(
    messageBus: MessageBus<Events, EventGens, Invokables, Streamables>,
    invokableName: string,
  ) {
    super(`Cannot find matching invoker for "${invokableName}".`)
    this.#messageBus = messageBus
    this.#invokableName = invokableName
  }

  get messageBus() {
    return this.#messageBus
  }

  get invokableName() {
    return this.#invokableName
  }
}
