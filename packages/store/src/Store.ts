export class Store<Actions extends BaseActions, Context> {
  #actionSubscriptions: Partial<
    Record<keyof Actions, ActionSubscription<Actions[keyof Actions], Context>[]>
  > = {}
  #dispatching = false
  #subscriptions: Subscription<Actions, Context>[] = []
  #staleSubscriptions: Subscription<Actions, Context>[] = []
  #reducers: Reducers<Actions, Context>
  #running = true
  #context!: Readonly<Context>

  constructor(reducers: Reducers<Actions, Context>) {
    this.#reducers = reducers
    this.dispatch('__init__', null)
  }

  get context() {
    return this.#context
  }

  deinit() {
    this.dispatch('__deinit__', null)
    this.#running = false
  }

  dispatch<Action extends keyof Actions>(
    action: Action,
    param: Actions[Action],
  ) {
    if (!this.#running) return

    if (this.#dispatching)
      throw new Error('You shouldnt dispatch actions from a reducer')

    this.#dispatching = true
    const context = this.#reduce(action, param)
    this.#dispatching = false

    if (context === this.#context) this.#updateStaleSubscribers(action, param)
    else {
      this.#context = Object.freeze(context)
      this.#updateSubscribers(action, param)
    }
  }

  on<Action extends keyof Actions>(
    action: Action,
    subscription: ActionSubscription<Actions[Action], Context>,
  ): Unsubscriber {
    this.#actionSubscriptions[action] ??= []
    return this.#subscribe(this.#actionSubscriptions[action], subscription)
  }

  subscribe(subscription: Subscription<Actions, Context>): Unsubscriber {
    if (this.#running) subscription('__init__', null, this.#context)
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
      subscriptions = [
        ...subscriptions.slice(0, index),
        ...subscriptions.slice(index + 1),
      ]
    }
  }

  #reduce<Action extends keyof Actions>(
    action: Action,
    param: Actions[Action],
  ) {
    return this.#reducers[action]?.(param, this.#context) ?? this.#context
  }

  #updateSubscribers<Action extends keyof Actions>(
    action: Action,
    param: Actions[Action],
  ) {
    if (this.#actionSubscriptions[action])
      for (const subscription of this.#actionSubscriptions[action])
        subscription(param, this.#context)
    for (const subscription of this.#subscriptions)
      subscription(action, param, this.#context)
  }

  #updateStaleSubscribers<Action extends keyof Actions>(
    action: Action,
    param: Actions[Action],
  ) {
    for (const subscription of this.#staleSubscriptions)
      subscription(action, param, this.#context)
  }
}

export interface BaseActions {
  __init__: null
  __deinit__?: null
}

export interface Reducer<Param, Context> {
  (param: Param, context: Readonly<Context>): Readonly<Context>
}

export type Reducers<Actions extends BaseActions, Context> = {
  [Action in keyof Actions]: Reducer<Actions[Action], Context>
}

export interface Subscription<Actions extends BaseActions, Context> {
  <Action extends keyof Actions>(
    action: Action,
    param: Actions[Action],
    context: Readonly<Context>,
  ): any
}

export interface ActionSubscription<Param, Context> {
  (param: Param, context: Readonly<Context>): any
}

export interface Unsubscriber {
  (): void
}
