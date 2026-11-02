import type { Channel, Frame } from './Channel.ts'

/**
 * An in-memory {@link Channel} for tests: a stand-in for a real transport with no
 * worker or socket. {@link LoopbackChannel.pair} returns two connected ends —
 * each end's `send` delivers to the other end's receivers.
 *
 * Delivery is deferred to a microtask (so it behaves like an async transport, not
 * a synchronous call) and each frame is structured-cloned on the way through (so a
 * receiver can't observe the sender's object identity, exactly as over a real
 * wire). Await a microtask in tests to flush pending deliveries.
 *
 * @example
 * ```ts
 * const [here, there] = LoopbackChannel.pair()
 * there.receive((frame) => seen.push(frame))
 * here.send({ kind: 'message', name: 'ping', payload: {} })
 * await Promise.resolve() // flush
 * ```
 */
export class LoopbackChannel implements Channel {
  /** Two connected ends: each one's `send` reaches the other's receivers. */
  static pair(): [LoopbackChannel, LoopbackChannel] {
    const a = new LoopbackChannel()
    const b = new LoopbackChannel()
    a.#peer = b
    b.#peer = a
    return [a, b]
  }

  #peer?: LoopbackChannel
  readonly #handlers = new Set<(frame: Frame) => void>()

  send(frame: Frame) {
    const peer = this.#peer
    if (!peer || !peer.#handlers.size) return
    const delivered = structuredClone(frame)
    queueMicrotask(() => {
      for (const handler of peer.#handlers) handler(delivered)
    })
  }

  receive(handler: (frame: Frame) => void) {
    this.#handlers.add(handler)
    return () => {
      this.#handlers.delete(handler)
    }
  }
}
