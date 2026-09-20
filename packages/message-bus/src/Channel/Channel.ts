/**
 * A Message Channel (EIP): a duplex pipe that carries {@link Frame}s to a peer
 * messaging system — another `MessageBus` in a web worker, a server, or another
 * window. A {@link MessagingBridge} owns one end; concrete adapters (postMessage,
 * WebSocket, …) implement this over a real transport and live in their own
 * packages, so this package stays environment-agnostic.
 *
 * Frames are already JSON-safe (their payloads have been through a message's
 * `$encode`), so an adapter serialises however its transport needs — postMessage
 * structured-clones the frame directly; a WebSocket adapter `JSON.stringify`s it.
 */
export interface Channel {
  /** Puts a frame on the wire toward the peer. */
  send(frame: Frame): void
  /** Registers a handler for inbound frames; returns a disposer that removes it. */
  receive(handler: (frame: Frame) => void): () => void
}

/**
 * What crosses the wire. A discriminated union on `kind`: a one-way `message`, and
 * the request/reply set for a command — a `command` out, then a stream of
 * `response` values, terminated by `response-end` or `response-error`, with
 * `abort` to cancel. Every command-related frame carries the
 * {@link CommandFrame.correlationId} that ties responses back to their request
 * (EIP's Correlation Identifier).
 */
export type Frame =
  | MessageFrame
  | CommandFrame
  | ResponseFrame
  | ResponseEndFrame
  | ResponseErrorFrame
  | AbortFrame

/** A one-way message: `name` resolves to a class on the peer, which decodes `payload`. */
export interface MessageFrame {
  kind: 'message'
  name: string
  payload: unknown
}

/** A command to invoke on the peer; responses come back tagged with `correlationId`. */
export interface CommandFrame {
  kind: 'command'
  name: string
  payload: unknown
  correlationId: string
}

/** One value streamed back by a responder for the command `correlationId`. */
export interface ResponseFrame {
  kind: 'response'
  correlationId: string
  value: unknown
}

/** Every responder for `correlationId` has settled; the response stream is complete. */
export interface ResponseEndFrame {
  kind: 'response-end'
  correlationId: string
}

/** A responder for `correlationId` threw; the response stream fails with `error`. */
export interface ResponseErrorFrame {
  kind: 'response-error'
  correlationId: string
  error: SerializedError
}

/** Cancel the in-flight command `correlationId` (the caller aborted). */
export interface AbortFrame {
  kind: 'abort'
  correlationId: string
  reason?: string
}

/**
 * A JSON-safe stand-in for an `Error` — the original error class is lost across
 * the wire; the caller side reconstructs a plain `Error` from these fields.
 */
export interface SerializedError {
  name: string
  message: string
  stack?: string
}
