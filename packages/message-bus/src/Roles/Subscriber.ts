import type { MessageFactory, MessageOf } from '../Message/Message.ts'

/**
 * Handles an emitted message. Registered with `gateway.on` / `gateway.once`. A
 * returned promise is not awaited by the emitter — messages are fire-and-forget.
 */
export interface Subscriber<M extends MessageFactory> {
  (message: MessageOf<M>): void | Promise<void>
}
