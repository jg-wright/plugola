import { InvokablesDict, InvokerRegistrationArgs } from '@plugola/invoke'
import type MessageBus from './MessageBus.js'
import SubscriptionDisposer from './SubscriptionDisposer.js'
import type {
  EventInterceptorArgs,
  EventsT,
  SubscriberArgs,
  UntilArgs,
  UntilRtn,
} from './types/events.js'
import type {
  EventGeneratorArgs,
  EventGeneratorsT,
} from './types/generators.js'
import type { InvokerInterceptorArgs } from './types/invokables.js'
import { ErrorHandler, Unsubscriber } from './types/MessageBus.js'
import { StreamReaderArgs, StreamsDict } from './types/streams.js'

export default class Broker<
  Events extends EventsT = EventsT,
  EventGens extends EventGeneratorsT = EventGeneratorsT,
  Invokables extends InvokablesDict = InvokablesDict,
  Streamables extends StreamsDict = StreamsDict,
> {
  constructor(
    messageBus: MessageBus<Events, EventGens, Invokables, Streamables>,
    id: string,
    abortController: AbortController,
  ) {
    this.#abortController = abortController
    this.#id = id
    this.#messageBus = messageBus
    this.onAbort(() => this.#disposer.dispose())
  }

  readonly #abortController: AbortController
  get abortController() {
    return this.#abortController
  }

  get aborted() {
    return this.abortSignal.aborted
  }

  get abortSignal(): AbortSignal {
    return this.#abortController.signal
  }

  readonly #disposer = new SubscriptionDisposer()
  get disposer() {
    return this.#disposer
  }

  readonly #id: string
  get id() {
    return this.#id
  }

  readonly #messageBus: MessageBus<Events, EventGens, Invokables, Streamables>
  get messageBus() {
    return this.#messageBus
  }

  readonly onAbort = (fn: () => any) => {
    this.abortSignal.addEventListener('abort', fn)
  }

  abort() {
    this.#abortController.abort()
  }

  onError(errorHandler: ErrorHandler) {
    return this.#messageBus.onError((error) => {
      if (error.brokerId === this.id) {
        errorHandler(error)
      }
    })
  }

  emit<EventName extends keyof Events>(
    eventName: EventName,
    ...args: Events[EventName]
  ): void | Promise<void> {
    return this.#messageBus.emit(this, eventName, args)
  }

  emitSignal<EventName extends keyof Events>(
    eventName: EventName,
    signal: AbortSignal,
    ...args: Events[EventName]
  ): void | Promise<void> {
    return this.#messageBus.emit(this, eventName, args, signal)
  }

  interceptEvent<EventName extends keyof Events>(
    eventName: EventName,
    ...args: EventInterceptorArgs<Events[EventName]>
  ): Unsubscriber {
    return this.#messageBus.interceptEvent(this as any, eventName, args)
  }

  on<EventName extends keyof Events>(
    eventName: EventName,
    ...args: SubscriberArgs<Events[EventName]>
  ): Unsubscriber {
    return this.#messageBus.on(this, eventName, args)
  }

  once<EventName extends keyof Events>(
    eventName: EventName,
    ...args: SubscriberArgs<Events[EventName]>
  ): Unsubscriber {
    return this.#messageBus.once(this, eventName, args)
  }

  hasSubscriber(eventName: keyof Events) {
    return this.#messageBus.hasSubscriber(eventName)
  }

  async until<
    EventName extends keyof Events,
    Args extends UntilArgs<Events[EventName]>,
  >(
    eventName: EventName,
    ...args: Args
  ): Promise<UntilRtn<Events[EventName], Args>> {
    return this.#messageBus.until(this, eventName, args) as any
  }

  async untilSignal<
    EventName extends keyof Events,
    Args extends UntilArgs<Events[EventName]>,
  >(
    eventName: EventName,
    abortSignal: AbortSignal,
    ...args: Args
  ): Promise<UntilRtn<Events[EventName], Args>> {
    return this.#messageBus.until(this, eventName, args, abortSignal) as any
  }

  generator<EventName extends keyof EventGens>(
    eventName: EventName,
    ...args: EventGeneratorArgs<
      EventGens[EventName]['args'],
      EventGens[EventName]['yield']
    >
  ): Unsubscriber {
    return this.#messageBus.generator(this, eventName, args)
  }

  iterate<EventName extends keyof EventGens>(
    eventName: EventName,
    ...args: EventGens[EventName]['args']
  ): AsyncIterable<EventGens[EventName]['yield']> {
    return this.#messageBus.iterate(this, eventName, args)
  }

  iterateSignal<EventName extends keyof EventGens>(
    eventName: EventName,
    abortSignal: AbortSignal,
    ...args: EventGens[EventName]['args']
  ): AsyncIterable<EventGens[EventName]['yield']> {
    return this.#messageBus.iterate(this, eventName, args, abortSignal)
  }

  iterateWithin<EventName extends keyof EventGens>(
    within: number,
    eventName: EventName,
    ...args: EventGens[EventName]['args']
  ): AsyncIterable<EventGens[EventName]['yield']> {
    return this.#messageBus.iterateWithin(this, within, eventName, args)
  }

  accumulate<EventName extends keyof EventGens>(
    eventName: EventName,
    ...args: EventGens[EventName]['args']
  ): Promise<EventGens[EventName]['yield'][]> {
    return this.#messageBus.accumulate(this, eventName, args)
  }

  accumulateWithin<EventName extends keyof EventGens>(
    within: number,
    eventName: EventName,
    ...args: EventGens[EventName]['args']
  ): Promise<EventGens[EventName]['yield'][]> {
    return this.#messageBus.accumulateWithin(this, within, eventName, args)
  }

  register<InvokableName extends keyof Invokables>(
    invokableName: InvokableName,
    ...args: InvokerRegistrationArgs<
      Invokables[InvokableName]['args'],
      Invokables[InvokableName]['return']
    >
  ): Unsubscriber {
    return this.#messageBus.register(this, invokableName, args)
  }

  invoke<InvokableName extends keyof Invokables>(
    invokableName: InvokableName,
    ...args: Invokables[InvokableName]['args']
  ): Promise<Invokables[InvokableName]['return']> {
    return this.#messageBus.invoke(this, invokableName, args)
  }

  invokeSignal<InvokableName extends keyof Invokables>(
    invokableName: InvokableName,
    abortSignal: AbortSignal,
    ...args: Invokables[InvokableName]['args']
  ): Promise<Invokables[InvokableName]['return']> {
    return this.#messageBus.invoke(this, invokableName, args, abortSignal)
  }

  interceptInvoker<InvokableName extends keyof Invokables>(
    invokableName: InvokableName,
    ...args: InvokerInterceptorArgs<
      Invokables[InvokableName]['args'],
      Invokables[InvokableName]['return']
    >
  ): Unsubscriber {
    return this.#messageBus.interceptInvoker(this, invokableName, args)
  }

  reader<StreamName extends keyof Streamables>(
    streamName: StreamName,
    ...args: StreamReaderArgs<
      Streamables[StreamName]['args'],
      Streamables[StreamName]['item']
    >
  ): Unsubscriber {
    return this.#messageBus.reader(this, streamName, args)
  }

  stream<StreamName extends keyof Streamables>(
    streamName: StreamName,
    ...args: Streamables[StreamName]['args']
  ): ReadableStream<Streamables[StreamName]['item']> {
    return this.#messageBus.stream(this, streamName, args)
  }
}
