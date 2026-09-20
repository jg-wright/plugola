# @plugola/message-bus

A small, class-based message bus for plugin systems, modelled on
[Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/).

Each member of the bus is a **participant**, and holds a **gateway**. Through it a
participant publishes and subscribes to **messages** (class instances defined with
`message()`), transforms them in flight with **interceptors**, and uses the
**invoke** pattern to ask other participants for a stream of values. Each
participant owns its own queue, so any participant can be paused and resumed
independently. Two buses in different runtimes (a window, a web worker, a server)
can be joined with a **messaging bridge**.

## Concepts at a glance

- **`MessageBus`** — the hub the host owns. It hands out gateways and controls
  participant lifecycle (`resume` / `pause` / `abort`).
- **`MessageGateway`** — what `bus.gateway(name)` returns; the object a
  participant actually uses to subscribe, emit, and invoke.
- **Message** — a class defined with `message()`. Routing is by _class_, not by
  `$name` (which is a label, and the key used on the wire when bridging).
- **`CommandMessage`** — defined with `command()`; a message that also collects a
  stream of values back from its responders.

The handler roles line up with EIP: a **Subscriber** receives messages
(`on` / `once` / `until`), a **Responder** streams values back for a command
(`register`), and an **Interceptor** is a Message Translator stage that can
transform or veto a message before subscribers see it (`intercept`).

## Defining messages

Define a message with `message()` and a command with `command()`. You give a wire
name and a payload type; the returned class takes the payload as its single
constructor argument and exposes it on the instance.

```typescript
import { message, command } from '@plugola/message-bus'

const Greeting = message<{ text: string }>('greeting')
const ListFiles = command<{ dir: string }, string>('list-files')

const greeting = new Greeting({ text: 'hello' })
greeting.text // 'hello'
greeting.$name // 'greeting'
```

Each class carries its own name (`$name`), which is how the bus routes it and how
it's addressed on the wire. A plain `message()`/`command()` is all you need to
route within a single bus. To send a message _across_ a
[bridge](#transports-bridging-buses) it also needs a codec (`$encode`/`$decode`);
that's added by defining it through a `MessageRegistry`, not by these factories —
see [Transports](#transports-bridging-buses).

## Getting started

```typescript
import { MessageBus, message } from '@plugola/message-bus'

const Greeting = message<{ text: string }>('greeting')

const bus = new MessageBus()
const alice = bus.gateway('alice')
const bob = bus.gateway('bob')

alice.on(Greeting, (greeting) => {
  console.info(`alice heard: ${greeting.text}`)
})

bus.resume()

bob.emit(new Greeting({ text: 'hello world' }))
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
gateway.emit(new Greeting({ text: 'hi' }))

bus.resume()
```

## Serializable payloads

Because a message can sit in a paused queue and be delivered later — and can
cross a bridge — its payload must be JSON-safe: strings, numbers, booleans,
`null`, and arrays/plain objects of those. This is a **compile-time** rule on
`emit` and `invoke` arguments; nothing is validated or cloned in-process. Keys
prefixed with `$` (framework metadata like `$name`) are exempt.

```typescript
const Clicked = message<{ el: HTMLElement }>('clicked')

gateway.emit(new Clicked({ el })) // ⛔ HTMLElement isn't serializable
```

Constraining payloads to plain data means a subscriber that receives a message
after the queue was paused sees a faithful snapshot rather than a possibly-stale
live reference.

## Filtering subscriptions

Pass a filter to narrow a subscription to the messages you care about. A filter
is a partial map of the message's properties; each value is either an expected
value (compared with `===`) or a predicate. **All** listed keys must match.

```typescript
const Order = message<{ status: 'pending' | 'paid'; total: number }>('order')

gateway.on(Order, { status: 'paid', total: (o) => o.total > 100 }, (order) => {
  console.info('big paid order', order)
})

gateway.emit(new Order({ status: 'pending', total: 500 })) // ignored — status
gateway.emit(new Order({ status: 'paid', total: 50 })) // ignored — total
gateway.emit(new Order({ status: 'paid', total: 500 })) // delivered
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
  (greeting) => new Greeting({ text: greeting.text.toUpperCase() }),
)

gateway.on(Greeting, (g) => console.info(g.text)) // "HELLO"

await gateway.emit(new Greeting({ text: 'hello' }))
```

Cancelling stops the message completely:

```typescript
import { CANCEL } from '@plugola/message-bus'

gateway.intercept(Greeting, () => CANCEL)

const result = await gateway.emit(new Greeting({ text: 'hello' }))
// result === CANCEL, and no subscribers were called
```

## Commands (request / stream)

A command is a message whose registered responders stream values back. Any number
of participants can register for the same command; the caller collects the values
from all of them (a scatter-gather).

```typescript
import { MessageBus, command } from '@plugola/message-bus'

const ListFiles = command<{ dir: string }, string>('list-files')

const bus = new MessageBus()
const fs = bus.gateway('fs')
const app = bus.gateway('app')
bus.resume()

fs.register(ListFiles, async (cmd, { send, signal }) => {
  for (const file of await readdir(cmd.dir, { signal })) send(file)
})

// collect everything into an array…
const files = await app.invoke(new ListFiles({ dir: '/tmp' })).collect()

// …or consume as a stream
for await (const file of app.invoke(new ListFiles({ dir: '/tmp' })).iterate()) {
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
  .invoke(new ListFiles({ dir: '/tmp' }), {
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

## Transports (bridging buses)

Two buses in separate runtimes — a window and a web worker, a client and a
server — can be joined with a **`MessagingBridge`** (EIP's _Messaging Bridge_).
The bridge joins each bus as a participant and replicates messages and commands
across a **`Channel`**, so neither bus core needs to know a transport exists.

A **`MessageRegistry`** is the contract the two ends share: it maps each `$name`
to its class, so a message named on the wire can be resolved and decoded on the
other side. Defining a message _through_ the registry registers it in one act —
so it can't be forgotten — and the registry doubles as the set of classes the
bridge relays.

```typescript
// contract.ts — imported by both ends
import { MessageRegistry } from '@plugola/message-bus'

export const registry = new MessageRegistry()
export const Ping = registry.registerMessage<{ at: number }>('ping')
export const Sum = registry.registerCommand<{ a: number; b: number }, number>(
  'sum',
)
```

Registering is also what gives a class its codec (`$encode`/`$decode`) — the
serialisation the bridge uses. By default a message encodes to its own fields and
decodes by reconstruction, so most messages need nothing extra. Pass a codec only
for non-trivial wire shapes:

```typescript
export const Occurred = registry.registerMessage<{ at: Date }>('occurred', {
  encode: (m) => ({ at: m.at.toISOString() }),
  decode: (p) => new Occurred({ at: new Date(p.at) }),
})
```

Wire a bridge onto each bus over a channel. `LoopbackChannel.pair()` is an
in-memory channel handy for tests and same-process bridging; for real transports
you implement `Channel` (two methods) over `postMessage`, a `WebSocket`, etc.

```typescript
import {
  MessageBus,
  MessagingBridge,
  LoopbackChannel,
} from '@plugola/message-bus'
import { registry, Sum } from './contract.ts'

const [here, there] = LoopbackChannel.pair()

new MessagingBridge(busA, here, registry)
new MessagingBridge(busB, there, registry)

// A responder on busB…
busB.gateway('math').register(Sum, (cmd, { send }) => send(cmd.a + cmd.b))

// …answers an invoke on busA, across the bridge.
const [sum] = await busA
  .gateway('app')
  .invoke(new Sum({ a: 2, b: 3 }))
  .collect()
// sum === 5
```

The bridge handles the awkward parts: only registered classes cross; a message
received from the wire is never relayed back (no echoes); commands are correlated
so responses stream to the right caller; cancelling an `invoke` aborts the remote
responder; and errors cross as a plain envelope.

### Implementing a `Channel`

A channel is a duplex pipe of frames. Each frame is already JSON-safe, so an
adapter serialises however its transport needs.

```typescript
import type { Channel, Frame } from '@plugola/message-bus'

class PostMessageChannel implements Channel {
  constructor(private readonly port: MessagePort) {}

  send(frame: Frame) {
    this.port.postMessage(frame)
  }

  receive(handler: (frame: Frame) => void) {
    const listener = (e: MessageEvent) => handler(e.data)
    this.port.addEventListener('message', listener)
    this.port.start()
    return () => this.port.removeEventListener('message', listener)
  }
}
```

Both ends build an equivalent registry from the shared contract module; the
classes are distinct objects per runtime (identity routes locally, `$name`s cross
the wire).
