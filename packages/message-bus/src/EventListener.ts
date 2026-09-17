import { EventClass, InvocationClass, InvocationType } from './Event.js'

/**
 * Handles an emitted event. Registered with `broker.on` / `broker.once`. A
 * returned promise is not awaited by the emitter — events are fire-and-forget.
 */
export interface EventListener<E extends EventClass> {
  (event: InstanceType<E>): void | Promise<void>
}

/**
 * Handles an invocation, streaming results back through `context.send`.
 * Registered with `broker.register`. The invocation completes for this handler
 * when the function returns (or its returned promise settles) — see
 * {@link InvocationListenerContext}.
 *
 * @example
 * ```ts
 * broker.register(ListFiles, async (event, { send, signal }) => {
 *   for (const file of await readdir(event.dir, { signal })) send(file)
 * })
 * ```
 */
export interface InvocationListener<E extends InvocationClass<unknown>> {
  (
    event: InstanceType<E>,
    context: InvocationListenerContext<E>,
  ): void | Promise<void>
}

/**
 * The context handed to an invocation listener. A listener streams results
 * through `send`; the invocation is considered complete for that listener when
 * the function it registered returns (or its returned promise settles). There
 * is deliberately no `finish` — completion is implicit, so a listener can never
 * forget to call it, and one that is filtered out or throws can't wedge the
 * stream. `signal` aborts when the consumer aborts, the broker aborts, or the
 * stream is otherwise torn down, so long-running work can bail early.
 */
export interface InvocationListenerContext<E extends InvocationClass<unknown>> {
  send: (value: InvocationType<E>) => void
  signal: AbortSignal
}

/**
 * Receives an error thrown (or rejected) by an individual invocation handler.
 * Handlers are isolated: reporting an error here lets the other handlers keep
 * streaming and the invocation still complete. The default sink rethrows, so an
 * unobserved handler error surfaces on the stream instead of being swallowed;
 * pass your own to `invoke({ onError })` to observe errors without failing it.
 */
export type InvocationErrorHandler = (error: unknown) => void

/**
 * Returned by an interceptor to stop an event dead: no further interceptors run
 * and no listeners are notified. Also the resolved value of `broker.emit` when
 * an interceptor cancelled the event.
 */
export const CANCEL = Symbol.for('dmg-bus/cancel')

/**
 * What an {@link InterceptionListener} may return:
 * - `void`/`undefined` — leave the event unchanged;
 * - a new event instance — replace it for downstream interceptors and listeners;
 * - {@link CANCEL} — drop the event entirely;
 * - a promise of any of the above.
 */
export type InterceptionResult<E extends EventClass> =
  | void
  | InstanceType<E>
  | typeof CANCEL
  | Promise<InterceptionResult<E>>

/**
 * Inspects an event before listeners see it and may transform or cancel it.
 * Registered with `broker.intercept`. Interceptors across brokers run in a
 * chain, each receiving the previous one's (possibly replaced) event.
 */
export interface InterceptionListener<E extends EventClass> {
  (event: InstanceType<E>): InterceptionResult<E>
}
