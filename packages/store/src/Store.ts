import { MethodQueue } from '@plugola/queue'

export class Store<Actions extends BaseActions, Context> {
  #context!: Readonly<Context>

  readonly #actionSubscriptions: Partial<
    Record<keyof Actions, ActionSubscription<Actions[keyof Actions], Context>[]>
  > = {}
  readonly #subscriptions: Subscription<Actions, Context>[] = []
  readonly #staleSubscriptions: Subscription<Actions, Context>[] = []
  readonly #reducers: Reducers<Actions, Context>
  readonly #queue = new MethodQueue()

  readonly dispatch = this.#queue.queueMethod(
    <Action extends keyof Actions>(
      ...args: ActionArgs<Action, Actions[Action]>
    ) => {
      const context = this.#reduce(...args)
      if (context === this.#context) this.#updateStaleSubscribers(...args)
      else {
        this.#context = Object.freeze(context)
        this.#updateSubscribers(...args)
      }
    },
  )

  constructor(reducers: Reducers<Actions, Context>) {
    this.#reducers = reducers
    this.#dispatchLifecycle('__init__')
  }

  get context() {
    return this.#context
  }

  deinit() {
    this.#dispatchLifecycle('__deinit__')
  }

  // __init__/__deinit__ are the framework's own void actions on BaseActions.
  // TS can't reduce ActionArgs<K, Actions[K]> through the class's own generic
  // Actions, so originate these param-less dispatches via the resolved type.
  #dispatchLifecycle(action: keyof BaseActions) {
    ;(this.dispatch as (action: keyof BaseActions) => unknown)(action)
  }

  resume() {
    this.#queue.resume()
  }

  pause() {
    this.#queue.pause()
  }

  on<Action extends keyof Actions>(
    action: Action,
    subscription: ActionSubscription<Actions[Action], Context>,
  ): Unsubscriber {
    this.#actionSubscriptions[action] ??= []
    return this.#subscribe(this.#actionSubscriptions[action], subscription)
  }

  subscribe(subscription: Subscription<Actions, Context>): Unsubscriber {
    return this.#subscribe(this.#subscriptions, subscription)
  }

  subscribeToStaleEvents(
    subscription: Subscription<Actions, Context>,
  ): Unsubscriber {
    return this.#subscribe(this.#staleSubscriptions, subscription)
  }

  #subscribe<T>(subscriptions: T[], subscription: T): Unsubscriber {
    subscriptions.push(subscription)

    return () => {
      const index = subscriptions.indexOf(subscription)
      if (index !== -1) subscriptions.splice(index, 1)
    }
  }

  #reduce<Action extends keyof Actions>(
    ...[action, ...params]: ActionArgs<Action, Actions[Action]>
  ) {
    return (
      this.#reducers[action]?.(
        this.#context,
        ...(params as [Actions[Action]]),
      ) ?? this.#context
    )
  }

  #updateSubscribers<Action extends keyof Actions>(
    ...args: ActionArgs<Action, Actions[Action]>
  ) {
    const [action, ...params] = args
    if (this.#actionSubscriptions[action])
      for (const subscription of this.#actionSubscriptions[action])
        subscription(this.#context, ...(params as [Actions[Action]]))
    for (const subscription of this.#subscriptions)
      subscription(this.#context, ...args)
  }

  #updateStaleSubscribers<Action extends keyof Actions>(
    ...args: ActionArgs<Action, Actions[Action]>
  ) {
    for (const subscription of this.#staleSubscriptions)
      subscription(this.#context, ...args)
  }
}

export interface BaseActions {
  __init__: void
  __deinit__?: void
}

export type Reducer<Param, Context> = [Param] extends [void]
  ? (context: Readonly<Context>) => Readonly<Context>
  : (context: Readonly<Context>, param: Param) => Readonly<Context>

export type Reducers<Actions extends BaseActions, Context> = {
  [Action in keyof Actions]: Reducer<Actions[Action], Context>
}

export interface Subscription<Actions extends BaseActions, Context> {
  <Action extends keyof Actions>(
    context: Readonly<Context>,
    ...args: ActionArgs<Action, Actions[Action]>
  ): any
}

export type ActionSubscription<Param, Context> = [Param] extends [void]
  ? (context: Readonly<Context>) => any
  : (context: Readonly<Context>, param: Param) => any

export interface Unsubscriber {
  (): void
}

type ActionArgs<Action, Param> = Param extends void
  ? [action: Action]
  : [action: Action, param: Param]
