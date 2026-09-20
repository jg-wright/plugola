import type { MessageBus } from '../MessageBus.ts'
import type { MessageClass } from '../Message/Message.ts'
import {
  CommandMessage,
  type CommandMessageClass,
} from '../Message/CommandMessage.ts'
import type { Transportable } from '../Message/Transportable.ts'
import type { MessageGateway } from '../Participant/MessageGateway.ts'
import type { Channel, Frame, SerializedError } from '../Channel/Channel.ts'
import type { MessageRegistry } from '../Channel/MessageRegistry.ts'
import { onAbort } from '../lang/AbortSignal.ts'

/**
 * A Messaging Bridge (EIP): couples a local {@link MessageBus} to a peer bus over
 * a {@link Channel}, replicating messages and commands between them. It joins the
 * bus as an ordinary participant, so the bus core needs no knowledge of transports.
 *
 * For every class in the {@link MessageRegistry}:
 *
 * - a **message** is relayed both ways — subscribed locally and sent as a frame
 *   ({@link MessageGateway.on} → {@link Channel.send}), and decoded and re-emitted
 *   on the way in ({@link Channel.receive} → {@link MessageGateway.emit});
 * - a **command** is relayed as a request/reply: a local `invoke` reaches the
 *   peer's responders (the bridge registers a responder that forwards the command
 *   under a fresh `correlationId` and streams the peer's responses back), and an
 *   inbound command is invoked locally with its responses streamed to the peer.
 *
 * The registry is the shared contract that lets a `$name` on the wire resolve to a
 * class on each side. A message or command that arrives from the wire is marked
 * and never relayed again — by this bridge or any other on the same bus — so there
 * are no echoes and (for now) no transitive forwarding across bridges.
 *
 * @example
 * ```ts
 * const [here, there] = LoopbackChannel.pair()
 * new MessagingBridge(browserBus, here, registry)
 * new MessagingBridge(workerBus, there, registry)
 * ```
 */
export class MessagingBridge {
  readonly #gateway: MessageGateway
  readonly #channel: Channel
  readonly #registry: MessageRegistry
  readonly #correlationId: () => string
  /** Outbound commands (we invoked) awaiting the peer's responses, by correlation id. */
  readonly #pending = new Map<string, PendingCommand>()
  /** Inbound commands (the peer invoked) running locally, by correlation id — abortable. */
  readonly #inbound = new Map<string, AbortController>()

  constructor(
    bus: MessageBus,
    channel: Channel,
    registry: MessageRegistry,
    {
      correlationId = () => crypto.randomUUID(),
      name = 'bridge',
    }: MessagingBridgeOptions = {},
  ) {
    this.#channel = channel
    this.#registry = registry
    this.#correlationId = correlationId
    this.#gateway = bus.gateway(name)

    const stopReceiving = channel.receive((frame) => this.#receive(frame))
    this.#gateway.onAbort((reason) => {
      stopReceiving()
      this.#teardown(reason)
    })

    for (const messageClass of registry.classes)
      if (isCommandClass(messageClass))
        this.#relayCommand(
          messageClass as CommandMessageClass & Transportable<any>,
        )
      else this.#relay(messageClass)
  }

  /** Tears down the bridge: stops relaying and receiving, and frees its name. */
  abort(reason?: unknown) {
    this.#gateway.abort(this.#gateway.name, reason)
  }

  /** Subscribes to `messageClass` locally and sends what it hears over the channel. */
  #relay(messageClass: MessageClass & Transportable<any>) {
    this.#gateway.on(messageClass, (message) => {
      if (isFromWire(message)) return
      this.#channel.send({
        kind: 'message',
        name: messageClass.$name,
        payload: messageClass.$encode(message),
      })
    })
  }

  /**
   * Registers a responder for `commandClass` that forwards a local `invoke` to the
   * peer: it sends a command frame under a fresh correlation id and stays pending
   * until the peer's `response`/`response-end`/`response-error` frames arrive.
   */
  #relayCommand(commandClass: CommandMessageClass & Transportable<any>) {
    this.#gateway.register(commandClass, (command, { send, signal }) => {
      if (isFromWire(command)) return
      const correlationId = this.#correlationId()
      return new Promise<void>((resolve, reject) => {
        this.#pending.set(correlationId, { send, resolve, reject })
        this.#channel.send({
          kind: 'command',
          name: commandClass.$name,
          payload: commandClass.$encode(command),
          correlationId,
        })
        // If the caller cancels before the peer finishes, tell the peer to stop and
        // settle here. Once the command has settled (response-end/-error), the entry
        // is gone and this is a no-op — so completion never sends a stray abort.
        onAbort(() => {
          if (!this.#pending.delete(correlationId)) return
          this.#channel.send({
            kind: 'abort',
            correlationId,
            reason: reasonText(signal.reason),
          })
          resolve()
        }, signal)
      })
    })
  }

  #receive(frame: Frame) {
    switch (frame.kind) {
      case 'message': {
        const messageClass = this.#registry.classFor(frame.name)
        if (!messageClass) return
        this.#gateway.emit(markFromWire(messageClass.$decode(frame.payload)))
        break
      }
      case 'command': {
        const commandClass = this.#registry.classFor(frame.name)
        if (!commandClass) return
        this.#invokeForPeer(
          markFromWire(commandClass.$decode(frame.payload)),
          frame.correlationId,
        )
        break
      }
      case 'response':
        this.#pending.get(frame.correlationId)?.send(frame.value)
        break
      case 'response-end':
        this.#settle(frame.correlationId)?.resolve()
        break
      case 'response-error':
        this.#settle(frame.correlationId)?.reject(reconstructError(frame.error))
        break
      case 'abort':
        this.#inbound
          .get(frame.correlationId)
          ?.abort(new Error(frame.reason ?? 'aborted'))
        break
    }
  }

  /** Invokes an inbound command locally and streams its responses back to the peer. */
  async #invokeForPeer(command: object, correlationId: string) {
    const controller = new AbortController()
    this.#inbound.set(correlationId, controller)
    try {
      const responses = this.#gateway.invoke(command as any, {
        signal: controller.signal,
      })
      for await (const value of responses.iterate())
        this.#channel.send({ kind: 'response', correlationId, value })
      if (!controller.signal.aborted)
        this.#channel.send({ kind: 'response-end', correlationId })
    } catch (error) {
      if (!controller.signal.aborted)
        this.#channel.send({
          kind: 'response-error',
          correlationId,
          error: serializeError(error),
        })
    } finally {
      this.#inbound.delete(correlationId)
    }
  }

  /** Removes and returns a pending command, so it is settled exactly once. */
  #settle(correlationId: string): PendingCommand | undefined {
    const pending = this.#pending.get(correlationId)
    this.#pending.delete(correlationId)
    return pending
  }

  /** On abort: cancel inbound invokes and reject outbound commands so no caller hangs. */
  #teardown(reason: unknown) {
    for (const controller of this.#inbound.values()) controller.abort(reason)
    this.#inbound.clear()

    const error =
      reason instanceof Error ? reason : new Error('MessagingBridge aborted')
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }
}

/** Constructor options for a {@link MessagingBridge}. */
export interface MessagingBridgeOptions {
  /**
   * Mints a correlation id per outbound command; need only be unique among this
   * bridge's in-flight commands. Defaults to `() => crypto.randomUUID()`; override
   * for a custom scheme or deterministic tests.
   */
  correlationId?: () => string
  /** The participant name the bridge registers under. Defaults to `'bridge'`. */
  name?: string
}

/** An outbound command awaiting the peer's streamed responses. */
interface PendingCommand {
  send(value: unknown): void
  resolve(): void
  reject(error: unknown): void
}

/** Whether a bus member's class is a command (needs the request/reply flow, not plain relay). */
function isCommandClass(messageClass: MessageClass<any>): boolean {
  return messageClass.prototype instanceof CommandMessage
}

/** Whether a message reached us from the wire — such a message is never relayed on. */
function isFromWire(message: object): boolean {
  return (message as Record<symbol, unknown>)[FROM_WIRE] === true
}

/** Tags a decoded message as wire-originated (shared across bridges, so none re-relay it). */
function markFromWire<M extends object>(message: M): M {
  ;(message as Record<symbol, unknown>)[FROM_WIRE] = true
  return message
}

/** Reduces an error to a JSON-safe envelope for the wire (the original class is lost). */
function serializeError(error: unknown): SerializedError {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack }
  return { name: 'Error', message: String(error) }
}

/** Rebuilds a plain `Error` from a wire envelope on the caller's side. */
function reconstructError(error: SerializedError): Error {
  const rebuilt = new Error(error.message)
  rebuilt.name = error.name
  if (error.stack) rebuilt.stack = error.stack
  return rebuilt
}

/** A JSON-safe description of an abort reason for the wire. */
function reasonText(reason: unknown): string | undefined {
  if (reason == null) return undefined
  if (reason instanceof Error) return reason.message
  return String(reason)
}

const FROM_WIRE = Symbol('fromWire')
