import type { Channel, Frame } from './Channel.ts'

/**
 * A {@link Channel} over a browser `postMessage` endpoint: a `Worker` (on the
 * page), the worker's own global scope (`self`, inside it), or either end of a
 * `MessageChannel`. Each structured-clones what it posts, so a {@link Frame}
 * crosses unchanged.
 *
 * Anything else posted on the same endpoint (by a library sharing the worker,
 * say) is not a frame and is ignored. A `Window` is not supported, since its
 * `postMessage` needs a target origin.
 *
 * @example
 * ```ts
 * // page
 * new MessagingBridge(bus, new PostMessageChannel(new Worker(url)), registry)
 * // worker
 * new MessagingBridge(bus, new PostMessageChannel(self), registry)
 * ```
 */
export class PostMessageChannel implements Channel {
  readonly #endpoint: PostMessageEndpoint

  constructor(endpoint: PostMessageEndpoint) {
    this.#endpoint = endpoint
  }

  send(frame: Frame) {
    this.#endpoint.postMessage(frame)
  }

  receive(handler: (frame: Frame) => void) {
    const listener = ({ data }: { data: unknown }) => {
      if (isFrame(data)) handler(data)
    }
    this.#endpoint.addEventListener('message', listener)
    // A MessagePort only delivers to `addEventListener` listeners once started.
    this.#endpoint.start?.()
    return () => {
      this.#endpoint.removeEventListener('message', listener)
    }
  }
}

/** What a `Worker`, a worker's global scope and a `MessagePort` have in common. */
export interface PostMessageEndpoint {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: any) => void): void
  removeEventListener(type: 'message', listener: (event: any) => void): void
  start?(): void
}

function isFrame(data: unknown): data is Frame {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { kind?: unknown }).kind === 'string'
  )
}
