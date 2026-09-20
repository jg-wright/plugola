import type { Channel, Frame } from './Channel.ts'

/**
 * A {@link Channel} over a `node:worker_threads` port — either a `Worker` (on the
 * main thread) or `parentPort` (inside the worker). Both expose the same
 * `postMessage` / `on('message')` shape, and `postMessage` structured-clones, so
 * a {@link Frame} crosses the thread boundary unchanged.
 *
 * This lives in the test tree deliberately: concrete transport adapters ship in
 * their own packages, keeping `message-bus` environment-agnostic.
 */
export class PortChannel implements Channel {
  readonly #port: PortLike

  constructor(port: PortLike) {
    this.#port = port
  }

  send(frame: Frame) {
    this.#port.postMessage(frame)
  }

  receive(handler: (frame: Frame) => void) {
    const listener = (frame: Frame) => handler(frame)
    this.#port.on('message', listener)
    return () => {
      this.#port.off('message', listener)
    }
  }
}

/** The overlap between a worker_threads `Worker` and a `MessagePort`. */
export interface PortLike {
  postMessage(value: unknown): void
  on(event: 'message', listener: (value: any) => void): unknown
  off(event: 'message', listener: (value: any) => void): unknown
}
