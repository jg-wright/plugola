# @plugola/message-bus

A small, class-based message bus for plugin systems.

Participants each get a **broker**. Brokers publish and subscribe to **events**
(plain class instances), transform them in flight with **interceptors**, and use
the **invoke** pattern to ask other brokers for a stream of values. Each broker
owns its own queue, so any broker can be paused and resumed independently.

## Concepts at a glance

- **`Bus`** — the hub the host owns. It hands out brokers and controls their
  lifecycle (`start` / `stop` / `abort`).
- **`PluginBroker`** — what `bus.broker(name)` returns; the object a participant
  actually uses.
- **Event** — any class instance with a `$name`. Routing is by _class_, not by
  `$name` (which is just a label for logging).
- **Invocation** — an event that also collects a stream of values back from its
  handlers.

## Getting started

```typescript
import { Bus, Event } from '@plugola/message-bus'

class Greeting implements Event {
  readonly $name = 'greeting'
  constructor(readonly text: string) {}
}

const bus = new Bus()
const alice = bus.broker('alice')
const bob = bus.broker('bob')

alice.on(Greeting, (event) => {
  console.info(`alice heard: ${event.text}`)
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

Brokers begin paused, so nothing is delivered until the bus is resumed — it's
safe to wire up subscriptions first. Messages emitted while a broker is paused
are buffered and replayed when it resumes.

```typescript
const bus = new Bus()
const broker = bus.broker('my-broker')

broker.on(Greeting, () => console.info("I'll run once the bus is resumed"))
broker.emit(new Greeting('hi'))

bus.resume()
```

## Filtering subscriptions

Pass a filter to narrow a subscription to the events you care about. A filter is
a partial map of the event's properties; each value is either an expected value
(compared with `===`) or a predicate. **All** listed keys must match.

```typescript
class Order implements Event {
  readonly $name = 'order'
  constructor(
    readonly status: 'pending' | 'paid',
    readonly total: number,
  ) {}
}

broker.on(Order, { status: 'paid', total: (o) => o.total > 100 }, (order) => {
  console.info('big paid order', order)
})

broker.emit(new Order('pending', 500)) // ignored — status doesn't match
broker.emit(new Order('paid', 50)) // ignored — total predicate fails
broker.emit(new Order('paid', 500)) // delivered
```

Filters work with `on`, `once`, `until`, `register`, and `intercept`.

## Waiting for an event

`until` resolves with the next matching event, and rejects if the broker is
aborted while waiting.

```typescript
const order = await broker.until(Order, { status: 'paid' })
```

## Interception

Interceptors run before listeners and can transform or cancel an event. Return a
new event to replace it, `CANCEL` to drop it, or nothing to leave it unchanged.
Interceptors across brokers form a chain, each seeing the previous one's result.

```typescript
broker.intercept(Greeting, (event) => new Greeting(event.text.toUpperCase()))

broker.on(Greeting, (e) => console.info(e.text)) // "HELLO"

await broker.emit(new Greeting('hello'))
```

Cancelling stops the event completely:

```typescript
import { CANCEL } from '@plugola/message-bus'

broker.intercept(Greeting, () => CANCEL)

const result = await broker.emit(new Greeting('hello'))
// result === CANCEL, and no listeners were called
```

## Invocations (request / stream)

An `Invocation` is an event whose registered handlers stream values back. Any
number of brokers can register for the same invocation; the caller collects the
values from all of them.

```typescript
import { Bus, Invocation } from '@plugola/message-bus'

class ListFiles extends Invocation<string> {
  readonly $name = 'list-files'
  constructor(readonly dir: string) {
    super()
  }
}

const bus = new Bus()
const fs = bus.broker('fs')
const app = bus.broker('app')
bus.resume()

fs.register(ListFiles, async (event, { send, signal }) => {
  for (const file of await readdir(event.dir, { signal })) send(file)
})

// collect everything into an array…
const files = await app.invoke(new ListFiles('/tmp')).collect()

// …or consume as a stream
for await (const file of app.invoke(new ListFiles('/tmp')).iterate()) {
  console.info(file)
}
```

A handler is done when its function returns (or its returned promise settles) —
there is no `finish()` to call. The invocation completes once every handler
across every broker has settled.

Because an invocation is emitted as an event before it is invoked, it can also be
filtered and intercepted like any other event.

### Cancelling and errors

Pass a `signal` to cancel; it is forwarded to handlers so they can abort
in-flight work. By default an unobserved handler error is fail-loud — it rejects
the stream. Pass `onError` to isolate handlers instead: errors are reported there
and the stream still completes with the healthy handlers' values.

```typescript
const files = await app
  .invoke(new ListFiles('/tmp'), {
    signal: AbortSignal.timeout(1_000),
    onError: (error) => console.warn('a file source failed', error),
  })
  .collect()
```

## Pausing and lifecycle

Each broker has its own queue, so brokers pause independently. Lifecycle methods
address brokers by name, so one participant can control another's.

```typescript
broker.pause('worker') // buffer the worker's messages
broker.resume('worker') // resume and drain them

broker.abort('worker') // permanent teardown; frees the name for reuse
```

The host can also drive every broker at once through the bus:

```typescript
bus.pause() // pause all
bus.resume() // resume all
```

A broker exposes its abort state for cleanup:

```typescript
broker.onAbort((reason) => cleanup(reason))
broker.aborted // boolean
broker.abortReason // the reason, if any
broker.abortSignal // the underlying AbortSignal
```
