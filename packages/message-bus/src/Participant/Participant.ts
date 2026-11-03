import type { MessageBus } from '../MessageBus.ts'
import { onAbort } from '../lang/AbortSignal.ts'
import { MethodQueue, Queuable } from '@plugola/queue'
import { PerformerRegistry } from './PerformerRegistry.ts'
import { MessageDispatcher } from './MessageDispatcher.ts'
import { MessageGateway } from './MessageGateway.ts'

/**
 * One named endpoint on the {@link MessageBus}. A participant is the shared
 * kernel of a bus member — its identity ({@link Participant.prototype.name}), its
 * {@link PerformerRegistry wiring}, its {@link MethodQueue queue} (the single
 * serialization point that lets it be paused and resumed), and its abort
 * lifecycle — with two faces onto it:
 *
 * - {@link MessageGateway} (outbound): what the application holds; publishes and
 *   registers performers.
 * - {@link MessageDispatcher} (inbound): what the bus drives; delivers messages
 *   to the registered performers.
 *
 * Both faces read and write the same kernel, so neither owns the other; the bus
 * owns the participant and hands the application its gateway.
 */
export class Participant extends Queuable {
  readonly registry = new PerformerRegistry()

  readonly abortSignal: AbortSignal

  readonly dispatcher: MessageDispatcher

  readonly gateway: MessageGateway

  readonly name: string

  readonly #abortController = new AbortController()

  constructor(
    bus: MessageBus,
    name: string,
    {
      abortSignal,
      queue = new MethodQueue(),
    }: { abortSignal?: AbortSignal; queue?: MethodQueue } = {},
  ) {
    super(queue)
    this.name = name
    this.abortSignal = abortSignal
      ? AbortSignal.any([abortSignal, this.#abortController.signal])
      : this.#abortController.signal

    this.onAbort(() => {
      this.registry.clear()
      // Deliver what it emitted while paused; inbound messages find no handlers.
      this.resume()
    })

    this.dispatcher = new MessageDispatcher(this, bus)
    this.gateway = new MessageGateway(this, bus)
  }

  onAbort(fn: (reason: any) => any) {
    return onAbort(fn, this.abortSignal)
  }

  get aborted() {
    return this.abortSignal.aborted
  }

  abort(reason?: unknown) {
    this.#abortController.abort(reason)
  }
}
