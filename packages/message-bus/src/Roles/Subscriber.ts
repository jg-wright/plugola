import { MessageClass } from '../Message/Message.js'

/**
 * Handles an emitted message. Registered with `gateway.on` / `gateway.once`. A
 * returned promise is not awaited by the emitter — messages are fire-and-forget.
 */
export interface Subscriber<M extends MessageClass> {
  (message: InstanceType<M>): void | Promise<void>
}
