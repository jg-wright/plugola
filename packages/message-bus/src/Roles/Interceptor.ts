import type { MessageFactory, MessageOf } from '../Message/Message.ts'

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
export interface Interceptor<M extends MessageFactory> {
  (message: MessageOf<M>): InterceptorResult<M>
}

/**
 * What an {@link Interceptor} may return:
 * - `void`/`undefined` — leave the message unchanged;
 * - a new message instance — replace it for downstream interceptors and subscribers;
 * - {@link CANCEL} — drop the message entirely;
 * - a promise of any of the above.
 */
export type InterceptorResult<M extends MessageFactory> =
  | void
  | MessageOf<M>
  | typeof CANCEL
  | Promise<void | MessageOf<M> | typeof CANCEL>

/**
 * Returned by an interceptor to stop a message dead: no further interceptors run
 * and no subscribers are notified. Also the resolved value of `gateway.emit`
 * when an interceptor cancelled the message.
 */
export const CANCEL = Symbol.for('dmg-bus/cancel')
