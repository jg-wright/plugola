# Message Bus Transports — Implementation Plan

Status: **approved for phase 1** · Applies to `@plugola/message-bus`

## Goal

Let two `MessageBus` instances in separate runtimes (browser window ↔ web
worker ↔ server) exchange messages and commands over a pluggable transport,
**without changing `MessageBus` itself**. Routing stays identity-based in
process; a **Messaging Bridge** (EIP) translates at the boundary.

## EIP naming

| Piece                                | EIP pattern            | Symbol                                             |
| ------------------------------------ | ---------------------- | -------------------------------------------------- |
| The wire                             | Message Channel        | `Channel` (+ `Frame`)                              |
| Factory definition (routing)         | —                      | `message()` / `command()`                          |
| Codec definition (wire)              | Message Translator     | `registry.registerMessage()` / `registerCommand()` |
| Name→factory contract & wire surface | —                      | `MessageRegistry`                                  |
| Couples two buses over a channel     | **Messaging Bridge**   | `MessagingBridge`                                  |
| Request/reply matching               | Correlation Identifier | `correlationId` on `Frame`                         |
| Concrete transports                  | Channel Adapter        | `PostMessageChannel`, … (own packages)             |

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
5. **Registry messages are data-only** (a factory is final identity; wrapping or
   re-creating it would break identity routing across the bridge). Hand-written
   factory + explicit registration is the documented escape hatch.
6. **Codec is layered on at registration, not baked into every message.**
   `message()`/`command()` return the core `MessageFactory`/`CommandMessageFactory`
   types, carrying only `$name` (identity + routing). The transport codec
   (`$encode`/`$decode`) is added by `MessageRegistry` when a factory is registered
   for bridging (via `makeTransportable`), so the registered factory is
   `MessageFactory<T> & Transportable<T>`. This resolves the original cost that the
   core message type was coupled to the codec: in-process-only users define plain
   messages and never touch a codec; only factories that cross a bridge acquire
   one. Factory-only authoring still holds; a message is a plain object built by
   its factory, never a `new`-constructed class. `Message` itself is
   payload-agnostic (the payload rides along as `& T` on the factory's output), so
   it carries no payload type parameter and the earlier contravariance friction at
   routing boundaries no longer applies.

## File layout

```
packages/message-bus/src/
  Message/
    Message.ts            # message() factory + Message/MessageFactory types (identity only)
    CommandMessage.ts     # command() factory + CommandMessage/CommandMessageFactory types
    Named.ts              # Named interface — the $name contract
    Codec.ts              # Codec type + defaultEncode
    Transportable.ts      # makeTransportable — adds $encode/$decode
  Channel/
    Channel.ts            # Channel interface + Frame union
    LoopbackChannel.ts    # in-memory channel for tests
    MessageRegistry.ts    # registerMessage()/registerCommand() → creates + wraps + registers
  Bridge/
    MessagingBridge.ts    # relays registry.messageFactories one-way, commandFactories as request/reply
  index.ts                # + export Channel, MessageRegistry, MessagingBridge, message, command
```

`MessageBus.ts`, `Participant/*`, `Queue/*`, `Roles/*` — unchanged.

## Components

### `message()` / `command()` — `Message/Message.ts`, `Message/CommandMessage.ts`

Each returns a **factory** you call (no `new`) to build a message — a plain
object stamped with `$name` and a `$factory` back-reference. The factory carries
identity only:

- `$name` on the factory and on every message it builds. No codec — routing only.
- The factory itself is the routing key; each message points back at it via
  `$factory` (replacing the old `message.constructor`).
- Payload constrained by `Serializable<T>` at the `emit`/`invoke` boundary.
- A factory is **final** identity (data messages only — decision 5).
- `command<T, R>` returns a `CommandMessageFactory<R, T>` building messages typed
  `CommandMessage<R>` carrying `$responseType`. It is identical to a message
  factory at runtime — what makes it a command is being registered as one (the
  registry keeps messages and commands in separate buckets), not any flag.

### `makeTransportable` — `Message/Transportable.ts`

Layers the codec (`$encode`/`$decode`) onto a factory, given an optional partial
`Codec`. Applied by the registry, not by the factories, so only bridged factories
carry it:

- Default `encode` = own non-`$` enumerable fields (`defaultEncode` in
  `Message/Codec.ts`); default `decode` = `factory(payload)`.
- A supplied `codec.encode`/`codec.decode` overrides either half.

### `MessageRegistry` — `Channel/MessageRegistry.ts`

Creation = registration; the registry is the shared contract _and_ the bridge's
forward set. `registerMessage`/`registerCommand` create the factory (via
`message()`/`command()`), wrap it with `makeTransportable` (so it becomes
`MessageFactory<T> & Transportable<T>`), and record it — in one act. Lives in a
module both ends import; each process gets its own instance with identical
contents. Messages and commands go in separate buckets. Throws on duplicate
`$name` (across both). Exposes `factoryFor(name)` (decode — kind-agnostic) and
`messageFactories` / `commandFactories` (the bridge's two subscribe sets), all
yielding transportable factories.

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

- **Outbound message**: `gateway.on(C)` per `registry.messageFactories`; on fire,
  send `{kind:'message', name: C.$name, payload: C.$encode(msg)}`. Encode needs no
  registry — the factory carries it. Commands come from
  `registry.commandFactories`, relayed as request/reply below.
- **Outbound command**: `gateway.register(C)` responder mints a `correlationId`,
  sends a `command` frame, and returns a promise held in `#pending`; inbound
  `response*` frames drive the responder's `send`/resolve/reject.
- **Inbound**: `channel.receive` → `registry.factoryFor(name).$decode(payload)` →
  re-`emit` (message) or `invoke().iterate()` and stream `response*` back.
- **Echo/loop avoidance**: decoded messages carry a module `FROM_WIRE` symbol
  (non-enumerable, never serialised); every bridge's subscriber/responder skips
  tagged messages (decision 1).
- **Abort**: caller cancel → `abort` frame → remote `invoke`'s signal aborts;
  teardown rejects all `#pending` and disposes `receive`.

## Serialization boundary

`Serializable<T>` is type-only today and nothing is ever cloned. This design
makes it real at exactly one hop: `$encode` produces JSON-safe data, the adapter
clones/stringifies, `$decode` rebuilds. The `$`-prefix exemption already covers
the generated `$name`/`$encode`/`$decode`.

## Test strategy (all on `LoopbackChannel`)

- **Factories** (`.test.ts` + `.test-d.ts`): `$name` on factory and message;
  payload spread; factory-identity routing; `Serializable` rejects non-JSON
  payloads; `command` response type flows to `invoke().collect()`. (No codec here
  — the factories carry identity only.)
- **Registry**: `register` returns a usable, transportable factory; default
  encode/decode round-trip; custom codec; duplicate name throws;
  `messageFactories`/`commandFactories`/`factoryFor`.
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
   valid under factory-only `MessageFactory`) to `message()`/`command()`, and a
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
