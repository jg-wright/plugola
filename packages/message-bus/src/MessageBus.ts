import { AbortError } from '@johngw/async'
import {
  accumulate,
  combineIterators,
  iteratorRace,
} from '@johngw/async-iterator'
import { filterMap, init, last, removeItem, replaceLastItem } from './array.js'
import Broker from './Broker.js'
import MessageBusError from './MessageBusError.js'
import { amend } from './object.js'
import { CancelEvent } from './symbols.js'
import {
  EventInterceptorArgs,
  EventInterceptors,
  SubscriberArgs,
  SubscriberFn,
  Subscribers,
  UntilArgs,
  UntilRtn,
} from './types/events.js'
import { EventGeneratorArgs, EventGenerators } from './types/generators.js'
import {
  InvokerInterceptorArgs,
  InvokerInterceptors,
  Invokers,
  MatchableInvokerRegistrationArgs,
} from './types/invokables.js'
import { Stringable, UnpackResolvableValue } from './types/util.js'
import {
  AddAbortSignal,
  ErrorHandler,
  MessageBusContext,
  Unsubscriber,
} from './types/MessageBus.js'
import { anySignal, fromSignal } from './AbortController.js'
import { InvokableNotRegisteredError } from './errors/InvokableNotRegisteredError.js'
import { InvokerFn } from '@plugola/invoke'
import { match } from './matcher.js'
import { StreamReader, StreamReaderArgs, Streams } from './types/streams.js'
import { WritableReadablePair } from '@johngw/stream/transformers/WritableReadablePair'
import { mergeUnderlyingSource } from '@johngw/stream'

export default class MessageBus<
  $ extends MessageBusContext = MessageBusContext,
> {
  #errorHandlers: ErrorHandler[] = []
  #eventInterceptors: EventInterceptors<$> = {}
  #eventGenerators: EventGenerators<$> = {}
  #invokers: Invokers<$> = {}
  #invokerInterceptors: InvokerInterceptors<$> = {}
  #queued: Array<() => unknown> = []
  #started = false
  #streams: Streams<$> = {}
  #subscribers: Subscribers<$> = {}

  onError(errorHandler: ErrorHandler) {
    this.#errorHandlers.push(errorHandler)
    return () => {
      this.#errorHandlers = removeItem(errorHandler, this.#errorHandlers)
    }
  }

  #reportError(brokerId: string, eventName: Stringable, error: Error) {
    for (const errorHandler of this.#errorHandlers)
      errorHandler(new MessageBusError(brokerId, eventName, error))
  }

  broker(id: string, abort?: AbortSignal | AbortController) {
    const abortController = !abort
      ? new AbortController()
      : abort instanceof AbortController
        ? abort
        : fromSignal(abort)

    return new Broker<$>(this, id, abortController)
  }

  async start() {
    this.#started = true
    return Promise.all(this.#queued.map((handle) => handle()))
  }

  emit<EventName extends keyof $['events']>(
    broker: Broker<$>,
    eventName: EventName,
    args: $['events'][EventName],
    abortSignal?: AbortSignal,
  ): void | Promise<void> {
    const handle = () => {
      let result: void | Promise<void> = undefined

      try {
        const interception = this.#callEventInterceptors(eventName, args)
        result = interception
          ? interception.then((moddedArgs) => {
              if (moddedArgs !== CancelEvent) {
                this.#callSubscribers(eventName, moddedArgs, abortSignal)
              }
            })
          : this.#callSubscribers(eventName, args, abortSignal)
      } catch (error: any) {
        this.#reportError(broker.id, eventName, error)
      }

      return result instanceof Promise
        ? result.catch((error) =>
            this.#reportError(broker.id, eventName, error),
          )
        : result
    }

    return this.#started
      ? handle()
      : this.#queue(broker, handle).catch((error) =>
          this.#reportError(broker.id, eventName, error),
        )
  }

  interceptEvent<EventName extends keyof $['events']>(
    broker: Broker<$>,
    eventName: EventName,
    args: EventInterceptorArgs<$['events'][EventName]>,
  ): Unsubscriber {
    const interceptor = {
      broker,
      args: init(args),
      fn: last(args),
    } as any

    this.#eventInterceptors = amend(
      this.#eventInterceptors,
      eventName,
      (interceptors = []) => [...interceptors!, interceptor],
    )

    return () => {
      this.#eventInterceptors[eventName] = removeItem(
        interceptor,
        this.#eventInterceptors[eventName]!,
      )
    }
  }

  interceptInvoker<InvokableName extends keyof $['invokables']>(
    broker: Broker<$>,
    invokableName: InvokableName,
    args: InvokerInterceptorArgs<
      $['invokables'][InvokableName]['args'],
      $['invokables'][InvokableName]['return']
    >,
  ): Unsubscriber {
    const interceptor = {
      broker,
      args: init(args),
      fn: last(args),
    } as any

    this.#invokerInterceptors = amend(
      this.#invokerInterceptors,
      invokableName,
      (interceptors = []) => [...interceptors!, interceptor],
    )

    return () => {
      this.#invokerInterceptors[invokableName] = removeItem(
        interceptor,
        this.#invokerInterceptors[invokableName]!,
      )
    }
  }

  on<EventName extends keyof $['events']>(
    broker: Broker<$>,
    eventName: EventName,
    args: SubscriberArgs<$['events'][EventName]>,
  ): Unsubscriber {
    if (broker.aborted) return () => {}

    const subscriber = {
      broker,
      args: init(args),
      fn: last(args),
    } as any

    this.#subscribers = amend(
      this.#subscribers,
      eventName,
      (subscribers = []) => [...subscribers!, subscriber],
    )

    const cancel = () => {
      this.#subscribers[eventName] = removeItem(
        subscriber,
        this.#subscribers[eventName]!,
      )
    }

    broker.onAbort(cancel)

    return cancel
  }

  once<EventName extends keyof $['events']>(
    broker: Broker<$>,
    eventName: EventName,
    args: SubscriberArgs<$['events'][EventName]>,
  ): Unsubscriber {
    const fn = last(args) as SubscriberFn<$['events'][EventName]>
    const onceFn: SubscriberFn<$['events'][EventName]> = (...args) => {
      cancel()
      return fn(...args)
    }
    const cancel = this.on(
      broker,
      eventName,
      replaceLastItem(args, onceFn) as SubscriberArgs<$['events'][EventName]>,
    )
    return cancel
  }

  async until<
    EventName extends keyof $['events'],
    Args extends UntilArgs<$['events'][EventName]>,
  >(
    broker: Broker<$>,
    eventName: EventName,
    args: Args,
    abortSignal?: AbortSignal,
  ): Promise<UntilRtn<$['events'][EventName], Args>> {
    return new Promise<UntilRtn<$['events'][EventName], Args>>(
      (resolve, reject) => {
        const abortSignalComposite = anySignal(abortSignal, broker.abortSignal)

        if (abortSignalComposite.aborted) return reject(new AbortError())

        const subscriberArgs = [
          ...args,
          (...args: any) => resolve(args),
        ] as SubscriberArgs<$['events'][EventName]>

        this.once(broker, eventName, subscriberArgs)

        abortSignalComposite.addEventListener('abort', () => {
          reject(new AbortError())
        })
      },
    )
  }

  hasSubscriber(eventName: keyof $['events']) {
    return !!this.#subscribers[eventName]?.length
  }

  generator<EventName extends keyof $['generators']>(
    broker: Broker<$>,
    eventName: EventName,
    args: EventGeneratorArgs<
      $['generators'][EventName]['args'],
      $['generators'][EventName]['yield']
    >,
  ): Unsubscriber {
    if (broker.aborted) return () => {}

    const iterator = {
      broker,
      args: init(args),
      fn: last(args),
    } as any

    this.#eventGenerators = amend(
      this.#eventGenerators,
      eventName,
      (iterators = []) => [...iterators!, iterator],
    )

    const cancel = () => {
      this.#eventGenerators[eventName] = removeItem(
        iterator,
        this.#eventGenerators[eventName]!,
      )
    }

    broker.onAbort(cancel)

    return cancel
  }

  async *iterate<EventName extends keyof $['generators']>(
    broker: Broker<$>,
    eventName: EventName,
    args: $['generators'][EventName]['args'],
    abortSignal?: AbortSignal,
  ): AsyncIterable<$['generators'][EventName]['yield']> {
    if (!this.#started) await this.#queue(broker, () => {})

    yield* combineIterators(
      ...(this.#eventGenerators[eventName] || [])!
        .filter((iterator) => this.#argumentIndex(iterator.args, args) !== -1)
        .map((iterator) =>
          iterator.fn(
            ...args.slice(this.#argumentIndex(iterator.args, args)),
            anySignal(abortSignal, iterator.broker.abortSignal),
          ),
        ),
    )
  }

  iterateWithin<EventName extends keyof $['generators']>(
    broker: Broker<$>,
    within: number,
    eventName: EventName,
    args: $['generators'][EventName]['args'],
    abortSignal?: AbortSignal,
  ): AsyncIterable<$['generators'][EventName]['yield']> {
    return iteratorRace(
      this.iterate(broker, eventName, args, abortSignal),
      within,
      anySignal(abortSignal, broker.abortSignal),
    )
  }

  async accumulate<EventName extends keyof $['generators']>(
    broker: Broker<$>,
    eventName: EventName,
    args: $['generators'][EventName]['args'],
    abortSignal?: AbortSignal,
  ) {
    return accumulate(this.iterate(broker, eventName, args, abortSignal))
  }

  async accumulateWithin<EventName extends keyof $['generators']>(
    broker: Broker<$>,
    within: number,
    eventName: EventName,
    args: $['generators'][EventName]['args'],
    abortSignal?: AbortSignal,
  ) {
    return accumulate(
      this.iterateWithin(broker, within, eventName, args, abortSignal),
    )
  }

  register<InvokableName extends keyof $['invokables']>(
    broker: Broker<$>,
    invokableName: InvokableName,
    allArgs: MatchableInvokerRegistrationArgs<
      $['invokables'][InvokableName]['args'],
      $['invokables'][InvokableName]['return']
    >,
  ): Unsubscriber {
    if (broker.aborted) return () => {}

    const args = init(allArgs) as $['invokables'][InvokableName]['args']
    const fn = last(allArgs) as InvokerFn<
      $['invokables'][InvokableName]['args'],
      $['invokables'][InvokableName]['return']
    >
    const invokers = this.#invokers[invokableName] || []
    const registeredInvoker = invokers.find(
      (invoker) => this.#argumentIndex(invoker.args, args) !== -1,
    )

    if (registeredInvoker)
      throw new Error(
        `An invoker has already been registered that matches ${invokableName.toString()} with args: ${args.join(
          ', ',
        )}.`,
      )

    const subscriber = {
      broker,
      args,
      fn,
    }

    this.#invokers[invokableName] = [
      ...invokers,
      subscriber,
    ] as unknown as Invokers<$>[InvokableName]

    const cancel = () => {
      this.#invokers[invokableName] = removeItem(
        subscriber,
        this.#invokers[invokableName] as any,
      ) as unknown as Invokers<$>[InvokableName]
    }

    broker.onAbort(() => setTimeout(cancel, 0))

    return cancel
  }

  async invoke<InvokableName extends keyof $['invokables']>(
    broker: Broker<$>,
    invokableName: InvokableName,
    args: $['invokables'][InvokableName]['args'],
    abortSignal?: AbortSignal,
  ): Promise<$['invokables'][InvokableName]['return']> {
    const handle = async () =>
      new Promise((resolve, reject) => {
        const abortSignalComposite = anySignal(abortSignal, broker.abortSignal)
        if (abortSignalComposite.aborted) return reject(new AbortError())
        abortSignalComposite.addEventListener('abort', () =>
          reject(new AbortError()),
        )

        resolve(this.#invokeChain(invokableName, args, abortSignalComposite))
      })

    return this.#started ? handle() : this.#queue(broker, handle)
  }

  reader<StreamName extends keyof $['streams']>(
    broker: Broker<$>,
    streamName: StreamName,
    allArgs: StreamReaderArgs<
      $['streams'][StreamName]['args'],
      $['streams'][StreamName]['item']
    >,
  ): Unsubscriber {
    type $StreamReader = StreamReader<$, StreamName>

    const streamer: $StreamReader = {
      broker,
      args: init(allArgs) as $StreamReader['args'],
      fn: last(allArgs) as $StreamReader['fn'],
    }

    this.#streams[streamName] ??= []

    this.#streams[streamName].push(streamer)

    const cancel = () => {
      this.#streams[streamName] = removeItem(
        streamer,
        this.#streams[streamName]!,
      )
    }

    broker.onAbort(cancel)

    return cancel
  }

  stream<StreamName extends keyof $['streams']>(
    broker: Broker<$>,
    streamName: StreamName,
    args: $['streams'][StreamName]['args'],
    abortSignal?: AbortSignal,
  ): ReadableStream<$['streams'][StreamName]['item']> {
    type Item = $['streams'][StreamName]['item']

    const streamers = this.#streams[streamName] ?? []

    const abortSignalComposite = anySignal(abortSignal, broker.abortSignal)

    const streams = () =>
      filterMap(
        streamers,
        (streamer) => this.#argumentIndex(streamer.args, args),
        (_streamer, argumentIndex) => argumentIndex !== -1,
        (streamer, argumentIndex) =>
          new ReadableStream(
            streamer.fn(
              ...([
                ...streamer.args.slice(0, argumentIndex),
                ...args.slice(argumentIndex),
                abortSignalComposite,
              ] as AddAbortSignal<$['streams'][StreamName]['args']>),
            ),
          ),
      )

    return new ReadableStream({
      start: async (controller) => {
        if (!this.#started) await this.#queue(broker, () => {})
        const abort = () => controller.error(abortSignalComposite.reason)
        if (abortSignalComposite.aborted) return abort()
        abortSignalComposite.addEventListener('abort', abort)
      },
    }).pipeThrough(
      new WritableReadablePair<never, Item>({}, mergeUnderlyingSource(streams)),
    )
  }

  #callEventInterceptors<EventName extends keyof $['events']>(
    eventName: EventName,
    args: $['events'][EventName],
  ): void | Promise<$['events'][EventName] | typeof CancelEvent> {
    const eventInterceptors = (this.#eventInterceptors[eventName] || [])!

    if (!eventInterceptors.length) return

    return (async () => {
      let moddedArgs: $['events'][EventName] | typeof CancelEvent = args

      for (const interceptor of eventInterceptors) {
        const index = this.#argumentIndex(interceptor.args, moddedArgs)

        if (index === -1) continue

        const newArgs = await interceptor.fn(...moddedArgs.slice(index))

        if (newArgs === CancelEvent) return CancelEvent
        else if (newArgs)
          moddedArgs = [
            ...moddedArgs.slice(0, index),
            ...newArgs,
          ] as $['events'][EventName]
      }

      return moddedArgs
    })()
  }

  async #invokeChain<InvokableName extends keyof $['invokables']>(
    invokableName: InvokableName,
    args: $['invokables'][InvokableName]['args'],
    signal: AbortSignal,
  ): Promise<$['invokables'][InvokableName]['return']> {
    const invokerInterceptors = this.#invokerInterceptors[invokableName] || []

    const invokeChain = async (
      index: number,
      args: $['invokables'][InvokableName]['args'],
    ): Promise<$['invokables'][InvokableName]['return']> => {
      const interceptor = invokerInterceptors[index]
      if (!interceptor) return this.#invoke(invokableName, args, signal)
      const argIndex = this.#argumentIndex(interceptor.args, args)
      return argIndex === -1
        ? invokeChain(index + 1, args)
        : interceptor.fn(
            (...nextArgs) => invokeChain(index + 1, nextArgs),
            ...args.slice(argIndex),
          )
    }

    return invokeChain(0, args)
  }

  #callSubscribers<EventName extends keyof $['events']>(
    eventName: EventName,
    args: $['events'][EventName],
    abortSignal?: AbortSignal,
  ): void | Promise<void> {
    const subscribers = (this.#subscribers[eventName] || [])!
    const promises: Promise<void>[] = []

    for (const subscriber of subscribers) {
      const index = this.#argumentIndex(subscriber.args, args)

      const subscriberAbortSignal = anySignal(
        abortSignal,
        subscriber.broker.abortSignal,
      )

      if (index >= 0) {
        const promise = subscriber.fn(
          ...args.slice(index),
          subscriberAbortSignal,
        )
        if (promise) {
          promises.push(promise)
        }
      }
    }

    if (promises.length) {
      return Promise.all(promises).then(() => {})
    }
  }

  async #invoke<InvokableName extends keyof $['invokables']>(
    invokableName: InvokableName,
    args: $['invokables'][InvokableName]['args'],
    abortSignal: AbortSignal,
  ): Promise<$['invokables'][InvokableName]['return']> {
    const invokers = this.#invokers[invokableName]
    const invoker =
      invokers &&
      invokers.find((invoker) => this.#argumentIndex(invoker.args, args) !== -1)

    if (!invoker) {
      throw new InvokableNotRegisteredError(this, invokableName.toString())
    }

    return invoker.fn(
      ...(args.slice(
        this.#argumentIndex(invoker.args, args),
      ) as $['invokables'][InvokableName]['args']),
      abortSignal,
    )
  }

  #argumentIndex(args1: ArrayLike<unknown>, args2: ArrayLike<unknown>) {
    if (!args1.length) return 0
    else if (args1.length > args2.length) return -1

    let i = 0
    for (; i < args1.length; i++) if (!match(args1[i], args2[i])) return -1
    return i
  }

  async #queue<T>(broker: Broker<$>, handler: () => T) {
    return new Promise<UnpackResolvableValue<T>>((resolve, reject) => {
      if (broker.aborted) return reject(new AbortError())

      const fn = () => resolve(handler() as UnpackResolvableValue<T>)
      this.#queued.push(fn)

      broker.onAbort(() => {
        this.#queued = removeItem(fn, this.#queued)
        reject(new AbortError())
      })
    })
  }
}
