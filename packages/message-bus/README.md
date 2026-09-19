# @plugola/message-bus

A small, class-based message bus for plugin systems, modelled on
[Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/).

Each member of the bus is a **participant**, and holds a **gateway**. Through it a
participant publishes and subscribes to **messages** (plain class instances),
transforms them in flight with **interceptors**, and uses the **invoke** pattern
to ask other participants for a stream of values. Each participant owns its own
queue, so any participant can be paused and resumed independently.

## Concepts at a glance

- **`MessageBus`** — the hub the host owns. It hands out gateways and controls
  participant lifecycle (`resume` / `pause` / `abort`).
- **`MessageGateway`** — what `bus.gateway(name)` returns; the object a
  participant actually uses to subscribe, emit, and invoke.
- **Message** — any class instance with a `$name`. Routing is by _class_, not by
  `$name` (which is just a label for logging).
- **`CommandMessage`** — a message that also collects a stream of values back
  from its responders.

The handler roles line up with EIP: a **Subscriber** receives messages
(`on` / `once` / `until`), a **Responder** streams values back for a
`CommandMessage` (`register`), and an **Interceptor** is a Message Translator
stage that can transform or veto a message before subscribers see it
(`intercept`).

## Getting started

```typescript
import { MessageBus, Message } from '@plugola/message-bus'

class Greeting implements Message {
  readonly $name = 'greeting'
  constructor(readonly text: string) {}
}

const bus = new MessageBus()
const alice = bus.gateway('alice')
const bob = bus.gateway('bob')

alice.on(Greeting, (message) => {
  console.info(`alice heard: ${message.text}`)
})

bus.resume()

bob.emit(new Greeting('hello world'))
```

Every subscription returns a disposer:

```typescript
const off = alice.on(Greeting, handler)
off() // unsubscribe
```

## Paused until resumed

Participants begin paused, so nothing is delivered until the bus is resumed —
it's safe to wire up subscriptions first. Messages emitted while a participant is
paused are buffered and replayed when it resumes.

```typescript
const bus = new MessageBus()
const gateway = bus.gateway('my-gateway')

gateway.on(Greeting, () => console.info("I'll run once the bus is resumed"))
gateway.emit(new Greeting('hi'))

bus.resume()
```

## Serializable payloads

Because a message can sit in a paused queue and be delivered later, its payload
must be JSON-safe — strings, numbers, booleans, `null`, and arrays/plain objects
of those. This is a **compile-time** rule on `emit` and `invoke` arguments;
nothing is validated or cloned at runtime. Keys prefixed with `$` (framework
metadata like `$name`) are exempt.

```typescript
class Clicked implements Message {
  readonly $name = 'clicked'
  constructor(readonly el: HTMLElement) {} // ⛔ emit(new Clicked(...)) errors
}
```

Constraining payloads to plain data means a subscriber that receives a message
after the queue was paused sees a faithful snapshot rather than a possibly-stale
live reference.

## Filtering subscriptions

Pass a filter to narrow a subscription to the messages you care about. A filter
is a partial map of the message's properties; each value is either an expected
value (compared with `===`) or a predicate. **All** listed keys must match.

```typescript
class Order implements Message {
  readonly $name = 'order'
  constructor(
    readonly status: 'pending' | 'paid',
    readonly total: number,
  ) {}
}

gateway.on(Order, { status: 'paid', total: (o) => o.total > 100 }, (order) => {
  console.info('big paid order', order)
})

gateway.emit(new Order('pending', 500)) // ignored — status doesn't match
gateway.emit(new Order('paid', 50)) // ignored — total predicate fails
gateway.emit(new Order('paid', 500)) // delivered
```

Filters work with `on`, `once`, `until`, `register`, and `intercept`.

## Waiting for a message

`until` resolves with the next matching message, and rejects if the participant
is aborted while waiting.

```typescript
const order = await gateway.until(Order, { status: 'paid' })
```

## Interception

Interceptors run before subscribers and can transform or cancel a message. Return
a new message to replace it, `CANCEL` to drop it, or nothing to leave it
unchanged. Interceptors across participants form a chain, each seeing the
previous one's result.

```typescript
gateway.intercept(
  Greeting,
  (message) => new Greeting(message.text.toUpperCase()),
)

gateway.on(Greeting, (m) => console.info(m.text)) // "HELLO"

await gateway.emit(new Greeting('hello'))
```

Cancelling stops the message completely:

```typescript
import { CANCEL } from '@plugola/message-bus'

gateway.intercept(Greeting, () => CANCEL)

const result = await gateway.emit(new Greeting('hello'))
// result === CANCEL, and no subscribers were called
```

## Commands (request / stream)

A `CommandMessage` is a message whose registered responders stream values back.
Any number of participants can register for the same command; the caller collects
the values from all of them (a scatter-gather).

```typescript
import { MessageBus, CommandMessage } from '@plugola/message-bus'

class ListFiles extends CommandMessage<string> {
  readonly $name = 'list-files'
  constructor(readonly dir: string) {
    super()
  }
}

const bus = new MessageBus()
const fs = bus.gateway('fs')
const app = bus.gateway('app')
bus.resume()

fs.register(ListFiles, async (command, { send, signal }) => {
  for (const file of await readdir(command.dir, { signal })) send(file)
})

// collect everything into an array…
const files = await app.invoke(new ListFiles('/tmp')).collect()

// …or consume as a stream
for await (const file of app.invoke(new ListFiles('/tmp')).iterate()) {
  console.info(file)
}
```

A responder is done when its function returns (or its returned promise settles) —
there is no `finish()` to call. The command completes once every responder across
every participant has settled.

Because a command is emitted as a message before it is invoked, it can also be
filtered and intercepted like any other message.

### Cancelling and errors

Pass a `signal` to cancel; it is forwarded to responders so they can abort
in-flight work. By default an unobserved responder error is fail-loud — it
rejects the stream. Pass `onError` to isolate responders instead: errors are
reported there and the stream still completes with the healthy responders'
values.

```typescript
const files = await app
  .invoke(new ListFiles('/tmp'), {
    signal: AbortSignal.timeout(1_000),
    onError: (error) => console.warn('a file source failed', error),
  })
  .collect()
```

## Pausing and lifecycle

Each participant has its own queue, so participants pause independently.
Lifecycle methods address participants by name, so one participant can control
another's.

```typescript
gateway.pause('worker') // buffer the worker's messages
gateway.resume('worker') // resume and drain them

gateway.abort('worker') // permanent teardown; frees the name for reuse
```

The host can also drive every participant at once through the bus:

```typescript
bus.pause() // pause all
bus.resume() // resume all
```

### Externally abortable participants

Pass an `AbortSignal` when creating a gateway to tie its lifetime to something
you already own — a plugin's own lifecycle, a request scope, a test's teardown.
Aborting that signal tears the participant down just like `abort(name)`.

```typescript
const controller = new AbortController()
const plugin = bus.gateway('plugin', controller.signal)

controller.abort() // clears the plugin's handlers and frees its name
```

A gateway exposes its abort state for cleanup via the underlying signal:

```typescript
gateway.onAbort((reason) => cleanup(reason))
gateway.abortSignal.aborted // boolean
gateway.abortSignal.reason // the reason, if any
```
