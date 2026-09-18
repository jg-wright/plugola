import { MessageClass } from '../Message/Message.js'

/**
 * Inspects a message before subscribers see it and may transform or cancel it.
 * Registered with `gateway.intercept`. Interceptors across gateways run in a
 * chain, each receiving the previous one's (possibly replaced) message.
 *
 * In EIP terms each interceptor is a *Message Translator* stage and the chain is
 * *Pipes and Filters*, with a *Message Filter* veto via {@link CANCEL}. Adding
 * data makes it a *Content Enricher*, stripping data a *Content Filter* — those
 * are uses of an interceptor, not the whole of it.
 */
export interface Interceptor<M extends MessageClass> {
  (message: InstanceType<M>): InterceptorResult<M>
}

/**
 * What an {@link Interceptor} may return:
 * - `void`/`undefined` — leave the message unchanged;
 * - a new message instance — replace it for downstream interceptors and subscribers;
 * - {@link CANCEL} — drop the message entirely;
 * - a promise of any of the above.
 */
export type InterceptorResult<M extends MessageClass> =
  | void
  | InstanceType<M>
  | typeof CANCEL
  | Promise<InterceptorResult<M>>

/**
 * Returned by an interceptor to stop a message dead: no further interceptors run
 * and no subscribers are notified. Also the resolved value of `gateway.emit`
 * when an interceptor cancelled the message.
 */
export const CANCEL = Symbol.for('dmg-bus/cancel')
