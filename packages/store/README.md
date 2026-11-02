# @plugola/store

> State management

## Usage

### Basic example

Imagine your `Context` is an object with a single `authors` property that is an array of author names.

```typescript
interface Context {
  authors: string[]
}
```

We want an "action" that adds authors to our context. So first describe our actions as an interface.

```typescript
import { BaseActions } from '@plugola/store'

interface Actions extends BaseActions {
  'add author': string
}
```

The above says we have one action, "add author", which accepts a `string` as its argument.

Now let's create the store. Each action maps to a **reducer** that receives the current `context` first, followed by the action's argument, and returns the next context.

```typescript
import { Store } from '@plugola/store'

const store = new Store<Actions, Context>({
  // This is called to initialise the context.
  __init__: () => ({ authors: [] }),

  // You cannot mutate the context. You must return a new instance.
  'add author': (context, author) => ({
    ...context,
    authors: [...context.authors, author],
  }),
})

store.resume()
```

Dispatches are queued and are not processed until you call `store.resume()`. This lets you register subscriptions before any action runs.

Now we can dispatch our 'add author' action to change our context.

```typescript
console.info(store.context) // { authors: [] }
store.dispatch('add author', 'Jane Austen')
console.info(store.context) // { authors: ['Jane Austen'] }
```

### Subscribing to changes

One of the most useful things about the store is that you can subscribe to whenever the context updates. Subscriptions receive the current `context`, followed by the dispatched action and its argument.

```typescript
store.subscribe((context, action, param) => {
  console.info(action, 'just happened with', param)
  console.info('now the context is', context)
})
```

The `subscribe` function returns an `unsubscribe` function.

```typescript
const unsubscribe = store.subscribe((context) => {
  if (context.authors.length > 5) unsubscribe()
})
```

This will only call your subscription each time the context changes. Whatever is returned from a reducer is compared against the current context with strict equality (`===`). You can use this to your advantage when you don't want to trigger your subscriptions — return the same context to signal "no change":

```typescript
const store = new Store<Actions, Context>({
  __init__: () => ({ authors: [] }),

  'add author': (context, author) =>
    context.authors.includes(author)
      ? context
      : {
          ...context,
          authors: [...context.authors, author],
        },
})

store.resume()
```

If you'd like to subscribe to actions that had zero effect on the context, use the following:

```typescript
store.subscribeToStaleEvents((context, action, param) => {
  console.info(`${action} was dispatched with zero effect to context`, context)
})
```

### Subscribing to a single action

Use `on` to subscribe to one specific action. The listener receives the current `context` followed by that action's argument, and only fires when the action actually changes the context.

```typescript
const unsubscribe = store.on('add author', (context, author) => {
  console.info('added', author)
})
```

Like `subscribe`, `on` returns an `unsubscribe` function.

### Pausing and resuming

`pause` stops the store from processing dispatched actions; `resume` starts it again. Any actions dispatched while paused are queued and run in order once resumed.

```typescript
store.pause()
store.dispatch('add author', 'Mary Shelley') // queued
store.resume() // now processed
```

### Tearing down

Call `deinit` to dispatch the `__deinit__` lifecycle action, giving you a chance to clean up. Provide a `__deinit__` reducer to handle it.

```typescript
const store = new Store<Actions, Context>({
  __init__: () => ({ authors: [] }),
  __deinit__: (context) => ({ ...context, authors: [] }),
  'add author': (context, author) => ({
    ...context,
    authors: [...context.authors, author],
  }),
})

store.resume()
store.deinit()
```
