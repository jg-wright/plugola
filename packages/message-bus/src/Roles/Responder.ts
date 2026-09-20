import type {
  CommandMessageFactory,
  ResponseType,
} from '../Message/CommandMessage.ts'
import type { MessageOf } from '../Message/Message.ts'

/**
 * Handles a command message, streaming results back through `context.send`.
 * Registered with `gateway.register`. The command completes for this responder
 * when the function returns (or its returned promise settles) — see
 * {@link ResponderContext}.
 *
 * @example
 * ```ts
 * gateway.register(ListFiles, async (command, { send, signal }) => {
 *   for (const file of await readdir(command.dir, { signal })) send(file)
 * })
 * ```
 */
export interface Responder<E extends CommandMessageFactory> {
  (command: MessageOf<E>, context: ResponderContext<E>): void | Promise<void>
}

/**
 * The context handed to a responder. A responder streams results through
 * `send`; the command is considered complete for that responder when the
 * function it registered returns (or its returned promise settles). There is
 * deliberately no `finish` — completion is implicit, so a responder can never
 * forget to call it, and one that is filtered out or throws can't wedge the
 * stream. `signal` aborts when the consumer aborts, the gateway aborts, or the
 * stream is otherwise torn down, so long-running work can bail early.
 */
export interface ResponderContext<E extends CommandMessageFactory> {
  send: (value: ResponseType<E>) => void
  signal: AbortSignal
}

/**
 * Receives an error thrown (or rejected) by an individual responder. Responders
 * are isolated: reporting an error here lets the other responders keep streaming
 * and the command still complete. The default sink rethrows, so an unobserved
 * responder error surfaces on the stream instead of being swallowed; pass your
 * own to `invoke({ onError })` to observe errors without failing it.
 */
export type ResponderErrorHandler = (error: unknown) => void
