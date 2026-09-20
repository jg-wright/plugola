# Message Bus Transports — Implementation Plan

Status: **approved for phase 1** · Applies to `@plugola/message-bus`

## Goal

Let two `MessageBus` instances in separate runtimes (browser window ↔ web
worker ↔ server) exchange messages and commands over a pluggable transport,
**without changing `MessageBus` itself**. Routing stays identity-based in
process; a **Messaging Bridge** (EIP) translates at the boundary.

## EIP naming

| Piece                              | EIP pattern            | Symbol                                             |
| ---------------------------------- | ---------------------- | -------------------------------------------------- |
| The wire                           | Message Channel        | `Channel` (+ `Frame`)                              |
| Class definition (routing)         | —                      | `message()` / `command()`                          |
| Codec definition (wire)            | Message Translator     | `registry.registerMessage()` / `registerCommand()` |
| Name→class contract & wire surface | —                      | `MessageRegistry`                                  |
| Couples two buses over a channel   | **Messaging Bridge**   | `MessagingBridge`                                  |
| Request/reply matching             | Correlation Identifier | `correlationId` on `Frame`                         |
| Concrete transports                | Channel Adapter        | `PostMessageChannel`, … (own packages)             |

## Confirmed decisions

1. **No transitive forwarding (v1).** A message arriving from the wire is not
   re-forwarded by any bridge on the same bus (a shared `FROM_WIRE` marker
   blocks every bridge). Star topology only; revisit for federation later.
2. **Bidirectional, all registered classes.** Per-message send-only/receive-only
   directionality is a later extension.
3. **Error envelope** is a plain `{ name, message, stack? }`; the caller side
   sees a reconstructed `Error`, not the original class.
4. **`correlationId` defaults to `() => crypto.randomUUID()`**, and stays
   overridable via options for a custom scheme or deterministic tests. (Initially
   injected-and-required to keep `crypto` out of the core; revised after seeing it
   in practice — `crypto.randomUUID` is a global in every target runtime, and the
   default is far less ceremony at the call site.) Ids need only be unique among
   currently-pending commands on one bridge instance.
5. **Registry messages are data-only** (the generated class is final; extending
   it would break identity routing across the bridge). Hand-written class +
   explicit registration is the documented escape hatch.
6. **Codec is layered on at registration, not baked into every message.**
   `message()`/`command()` return the core `MessageClass`/`CommandMessageClass`
   types, carrying only `$name` (identity + routing). The transport codec
   (`$encode`/`$decode`) is added by `MessageRegistry` when a class is registered
   for bridging (via `TransportableMixin`), so the registered class is
   `MessageClass<T> & Transportable<T>`. This resolves the original cost that the
   core message type was coupled to the codec: in-process-only users define plain
   messages and never touch a codec; only classes that cross a bridge acquire one.
   Factory-only authoring still holds; no hand-written `implements Message`
   classes. Remaining watch item: the payload sits in the (contravariant)
   constructor parameter, so watch for "no common supertype" friction at routing
   boundaries.

## File layout

```
packages/message-bus/src/
  Message/
    Message.ts            # message() factory + Message base (identity only)
    CommandMessage.ts     # command() factory + CommandMessage base
    Named.ts              # NamedMixin — $name static + instance
    Codec.ts              # Codec type + defaultEncode
    Transportable.ts      # TransportableMixin — adds $encode/$decode
  Channel/
    Channel.ts            # Channel interface + Frame union
    LoopbackChannel.ts    # in-memory channel for tests
    MessageRegistry.ts    # registerMessage()/registerCommand() → creates + wraps + registers
  Bridge/
    MessagingBridge.ts    # subscribes to registry.classes; encodes out / decodes in
  index.ts                # + export Channel, MessageRegistry, MessagingBridge, message, command
```

`MessageBus.ts`, `Participant/*`, `Queue/*`, `Roles/*` — unchanged.

## Components

### `message()` / `command()` — `Message/Message.ts`, `Message/CommandMessage.ts`

Generated classes own the constructor shape and carry identity only:

- Static + instance `$name` (instance via prototype). No codec — routing only.
- Payload constrained by `Serializable<T>` at the constructor boundary.
- Returned class is **final** (data messages only — decision 5).
- `command<T, R>` generates a `CommandMessage<R>` subclass carrying
  `$responseType`.

### `TransportableMixin` — `Message/Transportable.ts`

Layers the codec (`$encode`/`$decode` statics) onto a class, given an optional
partial `Codec`. Applied by the registry, not by the factories, so only bridged
classes carry it:

- Default `encode` = own non-`$` enumerable fields (`defaultEncode` in
  `Message/Codec.ts`); default `decode` = `new Class(payload)`.
- A supplied `codec.encode`/`codec.decode` overrides either half.

### `MessageRegistry` — `Channel/MessageRegistry.ts`

Creation = registration; the registry is the shared contract _and_ the bridge's
forward set. `registerMessage`/`registerCommand` create the class (via
`message()`/`command()`), wrap it with `TransportableMixin` (so it becomes
`MessageClass<T> & Transportable<T>`), and record it — in one act. Lives in a
module both ends import; each process gets its own instance with identical
contents. Throws on duplicate `$name`. Exposes `classFor(name)` (decode) and
`classes` (the bridge's subscribe set), both yielding transportable classes.

### `Channel` + `Frame` — `Channel/Channel.ts`

```ts
type Frame =
  | { kind: 'message'; name: string; payload: unknown }
  | { kind: 'command'; name: string; payload: unknown; correlationId: string }
  | { kind: 'response'; correlationId: string; value: unknown }
  | { kind: 'response-end'; correlationId: string }
  | { kind: 'response-error'; correlationId: string; error: SerializedError }
  | { kind: 'abort'; correlationId: string; reason?: string }

interface Channel {
  send(frame: Frame): void
  receive(handler: (frame: Frame) => void): () => void // disposer
}
```

Adapters serialise as their transport needs (postMessage structured-clones the
frame; a WebSocket adapter `JSON.stringify`s). `SerializedError` is never a raw
`Error`.

### `LoopbackChannel` — `Channel/LoopbackChannel.ts`

Two cross-wired `Channel`s delivering on a microtask. Makes the whole bridge
testable with no worker/socket.

### `MessagingBridge` — `Bridge/MessagingBridge.ts`

```ts
new MessagingBridge(bus, channel, registry, { correlationId, name = 'bridge' })
```

- **Outbound message**: `gateway.on(C)` per `registry.classes`; on fire, send
  `{kind:'message', name: C.$name, payload: C.$encode(msg)}`. Encode needs no
  registry — the class carries it.
- **Outbound command**: `gateway.register(C)` responder mints a `correlationId`,
  sends a `command` frame, and returns a promise held in `#pending`; inbound
  `response*` frames drive the responder's `send`/resolve/reject.
- **Inbound**: `channel.receive` → `registry.classFor(name).$decode(payload)` →
  re-`emit` (message) or `invoke().iterate()` and stream `response*` back.
- **Echo/loop avoidance**: decoded instances carry a module `FROM_WIRE` symbol
  (non-enumerable, never serialised); every bridge's subscriber/responder skips
  tagged instances (decision 1).
- **Abort**: caller cancel → `abort` frame → remote `invoke`'s signal aborts;
  teardown rejects all `#pending` and disposes `receive`.

## Serialization boundary

`Serializable<T>` is type-only today and nothing is ever cloned. This design
makes it real at exactly one hop: `$encode` produces JSON-safe data, the adapter
clones/stringifies, `$decode` rebuilds. The `$`-prefix exemption already covers
the generated `$name`/`$encode`/`$decode`.

## Test strategy (all on `LoopbackChannel`)

- **Factories** (`.test.ts` + `.test-d.ts`): static/instance `$name`; payload
  spread; class-identity routing; `Serializable` rejects non-JSON payloads;
  `command` response type flows to `invoke().collect()`. (No codec here — the
  factories carry identity only.)
- **Registry**: `register` returns a usable, transportable class; default
  encode/decode round-trip; custom codec; duplicate name throws;
  `classes`/`classFor`.
- **Bridge — messages**: one-way; round-trip; no echo; filters apply;
  pause/resume buffering intact.
- **Bridge — commands**: remote-only scatter-gather; mixed local+remote
  responders; streaming order preserved (deterministic `correlationId`).
- **Bridge — abort/errors**: caller cancel aborts remote responder's `signal`;
  remote throw surfaces via `onError` with the error envelope; teardown rejects
  pending and stops receiving.

## Implementation order

1. `message()` + `command()` factories (+ type tests). Pure, no I/O.
2. `MessageRegistry`.
3. `Channel` + `Frame` + `LoopbackChannel`.
4. `MessagingBridge` — messages only. Tests.
5. `MessagingBridge` — commands (correlation, streaming). Tests.
6. `MessagingBridge` — abort + error envelopes. Tests.
7. `index.ts` exports + docs. **Done:** exported the full transport surface; the
   README's examples were migrated from hand-written message classes (no longer
   valid under factory-only `MessageClass`) to `message()`/`command()`, and a
   transports section was added.
8. Concrete adapters (`PostMessageChannel`, `WebSocketChannel`) — separate
   packages, follow-up.

## Risks

- **Command streaming across the boundary** (correlation + completion + abort)
  is the sharpest edge; phased separately (5–6) with dedicated tests.
- **Mesh storms** if transitive forwarding is enabled carelessly — mitigated by
  the v1 star default (decision 1).
- **Error fidelity** — original error types are lost across the wire (envelope
  only); acceptable for v1.
