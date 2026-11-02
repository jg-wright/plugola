import type { Message, MessageFactory, MessageOf } from '../Message/Message.ts'
import type {
  CommandMessage,
  CommandMessageFactory,
} from '../Message/CommandMessage.ts'
import { CANCEL } from '../Roles/Interceptor.ts'
import { chain } from '../lang/chain.ts'
import type {
  ResponderContext,
  ResponderErrorHandler,
} from '../Roles/Responder.ts'
import type { Participant } from './Participant.ts'
import type { MessageGateway } from './MessageGateway.ts'
import type { MessageBus } from '../MessageBus.ts'

/**
 * The inbound half of a {@link Participant}: the bus delivers messages/commands
 * into this dispatcher, which drives the participant's local performers —
 * {@link MessageDispatcher.prototype.dispatch} runs its subscribers,
 * {@link MessageDispatcher.prototype.dispatchCommand} runs its responders, and
 * {@link MessageDispatcher.prototype.runInterceptors} runs its interceptor chain. It reads
 * the participant's {@link PerformerRegistry} (which the {@link MessageGateway}
 * facade writes) and is gated on the participant's queue, so a paused
 * participant delivers nothing. Only the MessageBus and internal machinery ever
 * hold one; participants receive the gateway (the outbound half) instead.
 */
export class MessageDispatcher {
  readonly dispatch: (message: Message) => void

  readonly #participant: Participant

  constructor(participant: Participant, bus: MessageBus) {
    this.#participant = participant

    this.dispatch = participant.queue.queueMethod((message: Message) => {
      for (const performer of participant.registry.subscribersFor(
        message.$factory,
      ) ?? [])
        if (performer.sync) performer.perform(message)
        else bus.dispatcher(() => performer.perform(message))
    })
  }

  /**
   * Runs the participant's interceptors for the message in turn. Synchronous
   * when they all return synchronously.
   */
  runInterceptors<E extends MessageFactory | CommandMessageFactory>(
    message: MessageOf<E>,
  ): MessageOf<E> | typeof CANCEL | Promise<MessageOf<E> | typeof CANCEL> {
    if (!this.#participant.queue.running) return message

    const interceptors = this.#participant.registry.interceptorsFor(
      (message as Message).$factory,
    )

    if (!interceptors?.size) return message

    return chain([...interceptors], message, (interceptor, message) =>
      interceptor.perform(message),
    )
  }

  /**
   * Runs every local responder for the command and resolves once they have all
   * settled. Completion is derived from the responders' own return values: a
   * filtered-out responder resolves immediately (its `handle` returns
   * `undefined`), so there's no count to keep in sync and nothing to hang on. The
   * responder set is snapshotted, so (un)registering during an in-flight command
   * can't move the target. Responders are isolated: one that throws is routed to
   * `reportError` and neither stops its siblings nor prevents completion.
   */
  async dispatchCommand<T>(
    command: CommandMessage<T>,
    context: ResponderContext<CommandMessageFactory<T>>,
    reportError: ResponderErrorHandler,
  ): Promise<void> {
    if (!this.#participant.queue.running) return

    const responders = this.#participant.registry.respondersFor(
      command.$factory as CommandMessageFactory<T>,
    )

    if (!responders?.size) return

    await Promise.all(
      Array.from(responders, async (performer) => {
        try {
          await performer.perform(command, context)
        } catch (error) {
          reportError(error)
        }
      }),
    )
  }
}
