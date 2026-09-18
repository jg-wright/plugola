import type { MessageBus } from '../MessageBus.js'
import type { Message, MessageClass } from '../Message/Message.js'
import type {
  CommandMessage,
  CommandMessageClass,
} from '../Message/CommandMessage.js'
import { CANCEL } from '../Roles/Interceptor.js'
import type {
  ResponderContext,
  ResponderErrorHandler,
} from '../Roles/Responder.js'
import { onAbort } from '../lang/AbortSignal.js'
import { MethodQueue } from '../Queue/MethodQueue.js'
import { Handler } from './Handler.js'
import { MessageGateway } from './MessageGateway.js'

/**
 * The inbound half of a participant: the bus delivers messages/commands into
 * this dispatcher, which drives the participant's local performers —
 * {@link MessageDispatcher.dispatch} runs its subscribers,
 * {@link MessageDispatcher.dispatchCommand} runs its responders, and
 * {@link MessageDispatcher.runInterceptors} runs its interceptor chain. Only the
 * MessageBus and internal machinery ever hold one; participants receive a
 * {@link MessageGateway} facade (the outbound half) instead. Owns the performer
 * registries and the queue that lets the participant be paused and resumed.
 */
export class MessageDispatcher {
  readonly subscribers = new Map<MessageClass, Set<Handler<Message>>>()

  readonly responders = new Map<
    CommandMessageClass,
    Set<Handler<CommandMessage>>
  >()

  readonly interceptors = new Map<MessageClass, Set<Handler<Message>>>()

  readonly queue = new MethodQueue()

  readonly dispatch: (message: Message) => void

  readonly #abortController = new AbortController()

  readonly abortSignal: AbortSignal

  constructor(
    readonly bus: MessageBus,
    readonly name: string,
    abortSignal?: AbortSignal,
  ) {
    this.abortSignal = abortSignal
      ? AbortSignal.any([abortSignal, this.#abortController.signal])
      : this.#abortController.signal

    this.onAbort(() => {
      this.subscribers.clear()
      this.responders.clear()
    })

    this.dispatch = this.queue.queueMethod((message: Message) => {
      for (const handler of this.subscribers.get(
        message.constructor as MessageClass,
      ) ?? [])
        handler.handle(message)
    })
  }

  onAbort(fn: (reason: any) => any) {
    return onAbort(fn, this.abortSignal)
  }

  get aborted() {
    return this.abortSignal.aborted
  }

  async runInterceptors<E extends MessageClass | CommandMessageClass>(
    message: InstanceType<E>,
  ): Promise<InstanceType<E> | typeof CANCEL> {
    if (!this.queue.running) return message

    const interceptors = this.interceptors.get(
      message.constructor as MessageClass,
    )

    if (!interceptors?.size) return message

    for (const interceptor of interceptors) {
      const result = await interceptor.handle(message)
      if (result === CANCEL) return CANCEL
      else if (result) message = result as InstanceType<E>
    }

    return message
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
    context: ResponderContext<CommandMessageClass<T>>,
    reportError: ResponderErrorHandler,
  ): Promise<void> {
    if (!this.queue.running) return

    const responders = this.responders.get(
      command.constructor as CommandMessageClass<T>,
    )

    if (!responders?.size) return

    await Promise.all(
      Array.from(responders, async (handler) => {
        try {
          await handler.handle(command, context)
        } catch (error) {
          reportError(error)
        }
      }),
    )
  }

  resume() {
    this.queue.start()
  }

  pause() {
    this.queue.stop()
  }

  abort(reason?: unknown) {
    this.#abortController.abort(reason)
  }

  createGateway() {
    return new MessageGateway(this)
  }
}
