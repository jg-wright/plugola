import { InvokerRegistrationArgs } from '@plugola/invoke'
import type MessageBus from './MessageBus.js'
import SubscriptionDisposer from './SubscriptionDisposer.js'
import type {
  EventInterceptorArgs,
  SubscriberArgs,
  UntilArgs,
  UntilRtn,
} from './types/events.js'
import type { EventGeneratorArgs } from './types/generators.js'
import type { InvokerInterceptorArgs } from './types/invokables.js'
import {
  ErrorHandler,
  MessageBusContext,
  Unsubscriber,
} from './types/MessageBus.js'
import { StreamReaderArgs } from './types/streams.js'

export default class Broker<$ extends MessageBusContext = MessageBusContext> {
  constructor(
    messageBus: MessageBus<$>,
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

  readonly #messageBus: MessageBus<$>
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

  emit<EventName extends keyof $['events']>(
    eventName: EventName,
    ...args: $['events'][EventName]
  ): void | Promise<void> {
    return this.#messageBus.emit(this, eventName, args)
  }

  emitSignal<EventName extends keyof $['events']>(
    eventName: EventName,
    signal: AbortSignal,
    ...args: $['events'][EventName]
  ): void | Promise<void> {
    return this.#messageBus.emit(this, eventName, args, signal)
  }

  interceptEvent<EventName extends keyof $['events']>(
    eventName: EventName,
    ...args: EventInterceptorArgs<$['events'][EventName]>
  ): Unsubscriber {
    return this.#messageBus.interceptEvent(this as any, eventName, args)
  }

  on<EventName extends keyof $['events']>(
    eventName: EventName,
    ...args: SubscriberArgs<$['events'][EventName]>
  ): Unsubscriber {
    return this.#messageBus.on(this, eventName, args)
  }

  once<EventName extends keyof $['events']>(
    eventName: EventName,
    ...args: SubscriberArgs<$['events'][EventName]>
  ): Unsubscriber {
    return this.#messageBus.once(this, eventName, args)
  }

  hasSubscriber(eventName: keyof $['events']) {
    return this.#messageBus.hasSubscriber(eventName)
  }

  async until<
    EventName extends keyof $['events'],
    Args extends UntilArgs<$['events'][EventName]>,
  >(
    eventName: EventName,
    ...args: Args
  ): Promise<UntilRtn<$['events'][EventName], Args>> {
    return this.#messageBus.until(this, eventName, args) as any
  }

  async untilSignal<
    EventName extends keyof $['events'],
    Args extends UntilArgs<$['events'][EventName]>,
  >(
    eventName: EventName,
    abortSignal: AbortSignal,
    ...args: Args
  ): Promise<UntilRtn<$['events'][EventName], Args>> {
    return this.#messageBus.until(this, eventName, args, abortSignal) as any
  }

  generator<EventName extends keyof $['generators']>(
    eventName: EventName,
    ...args: EventGeneratorArgs<
      $['generators'][EventName]['args'],
      $['generators'][EventName]['yield']
    >
  ): Unsubscriber {
    return this.#messageBus.generator(this, eventName, args)
  }

  iterate<EventName extends keyof $['generators']>(
    eventName: EventName,
    ...args: $['generators'][EventName]['args']
  ): AsyncIterable<$['generators'][EventName]['yield']> {
    return this.#messageBus.iterate(this, eventName, args)
  }

  iterateSignal<EventName extends keyof $['generators']>(
    eventName: EventName,
    abortSignal: AbortSignal,
    ...args: $['generators'][EventName]['args']
  ): AsyncIterable<$['generators'][EventName]['yield']> {
    return this.#messageBus.iterate(this, eventName, args, abortSignal)
  }

  iterateWithin<EventName extends keyof $['generators']>(
    within: number,
    eventName: EventName,
    ...args: $['generators'][EventName]['args']
  ): AsyncIterable<$['generators'][EventName]['yield']> {
    return this.#messageBus.iterateWithin(this, within, eventName, args)
  }

  accumulate<EventName extends keyof $['generators']>(
    eventName: EventName,
    ...args: $['generators'][EventName]['args']
  ): Promise<$['generators'][EventName]['yield'][]> {
    return this.#messageBus.accumulate(this, eventName, args)
  }

  accumulateWithin<EventName extends keyof $['generators']>(
    within: number,
    eventName: EventName,
    ...args: $['generators'][EventName]['args']
  ): Promise<$['generators'][EventName]['yield'][]> {
    return this.#messageBus.accumulateWithin(this, within, eventName, args)
  }

  register<InvokableName extends keyof $['invokables']>(
    invokableName: InvokableName,
    ...args: InvokerRegistrationArgs<
      $['invokables'][InvokableName]['args'],
      $['invokables'][InvokableName]['return']
    >
  ): Unsubscriber {
    return this.#messageBus.register(this, invokableName, args)
  }

  invoke<InvokableName extends keyof $['invokables']>(
    invokableName: InvokableName,
    ...args: $['invokables'][InvokableName]['args']
  ): Promise<$['invokables'][InvokableName]['return']> {
    return this.#messageBus.invoke(this, invokableName, args)
  }

  invokeSignal<InvokableName extends keyof $['invokables']>(
    invokableName: InvokableName,
    abortSignal: AbortSignal,
    ...args: $['invokables'][InvokableName]['args']
  ): Promise<$['invokables'][InvokableName]['return']> {
    return this.#messageBus.invoke(this, invokableName, args, abortSignal)
  }

  interceptInvoker<InvokableName extends keyof $['invokables']>(
    invokableName: InvokableName,
    ...args: InvokerInterceptorArgs<
      $['invokables'][InvokableName]['args'],
      $['invokables'][InvokableName]['return']
    >
  ): Unsubscriber {
    return this.#messageBus.interceptInvoker(this, invokableName, args)
  }

  reader<StreamName extends keyof $['streams']>(
    streamName: StreamName,
    ...args: StreamReaderArgs<
      $['streams'][StreamName]['args'],
      $['streams'][StreamName]['item']
    >
  ): Unsubscriber {
    return this.#messageBus.reader(this, streamName, args)
  }

  stream<StreamName extends keyof $['streams']>(
    streamName: StreamName,
    ...args: $['streams'][StreamName]['args']
  ): ReadableStream<$['streams'][StreamName]['item']> {
    return this.#messageBus.stream(this, streamName, args)
  }
}
