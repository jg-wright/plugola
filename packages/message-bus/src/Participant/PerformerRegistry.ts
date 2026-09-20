import type { Message, MessageFactory } from '../Message/Message.ts'
import type {
  CommandMessage,
  CommandMessageFactory,
} from '../Message/CommandMessage.ts'
import type { Subscriber } from '../Roles/Subscriber.ts'
import type { Interceptor } from '../Roles/Interceptor.ts'
import type { Responder } from '../Roles/Responder.ts'
import type { Filter } from '../Filter.ts'
import { getOrInsert } from '../lang/Map.ts'
import { SelectivePerformer } from './SelectivePerformer.ts'

/**
 * A participant's local wiring: the set of {@link Subscriber}s,
 * {@link Responder}s, and {@link Interceptor}s it has registered, each keyed by
 * the message class it performs on. The {@link MessageGateway} writes to it (as
 * the participant subscribes/registers/intercepts) and the
 * {@link MessageDispatcher} reads from it (as the bus delivers), so it is the
 * shared collaborator between the two halves rather than being owned by either.
 *
 * Each `add*` returns a disposer that removes just that handler and reports
 * whether its message class now has no handlers left — the gateway uses that to
 * decide when to drop the participant's bus-level route.
 */
export class PerformerRegistry {
  readonly addSubscriber = <M extends MessageFactory>(
    messageClass: M,
    filter: Filter<M>,
    subscriber: Subscriber<M>,
  ) => this.#add(this.#subscribers, messageClass, filter, subscriber)

  readonly addResponder = <E extends CommandMessageFactory>(
    commandClass: E,
    filter: Filter<E>,
    responder: Responder<E>,
  ) => this.#add(this.#responders, commandClass, filter, responder)

  readonly addInterceptor = <M extends MessageFactory>(
    messageClass: M,
    filter: Filter<M>,
    interceptor: Interceptor<M>,
  ) => this.#add(this.#interceptors, messageClass, filter, interceptor)

  subscribersFor(messageClass: MessageFactory) {
    return this.#subscribers.get(messageClass)
  }

  respondersFor(commandClass: CommandMessageFactory) {
    return this.#responders.get(commandClass)
  }

  interceptorsFor(messageClass: MessageFactory) {
    return this.#interceptors.get(messageClass)
  }

  /** Drops every registered performer; used when the participant is aborted. */
  clear() {
    this.#subscribers.clear()
    this.#responders.clear()
    this.#interceptors.clear()
  }

  readonly #subscribers = new Map<
    MessageFactory,
    Set<SelectivePerformer<Message>>
  >()

  readonly #responders = new Map<
    CommandMessageFactory,
    Set<SelectivePerformer<CommandMessage>>
  >()

  readonly #interceptors = new Map<
    MessageFactory,
    Set<SelectivePerformer<Message>>
  >()

  #add(
    registry: Map<any, Set<SelectivePerformer<any>>>,
    messageClass: unknown,
    filter: Filter<MessageFactory>,
    callback: (...args: any[]) => any,
  ): () => boolean {
    const performers = getOrInsert(registry, messageClass, new Set())
    const performer = new SelectivePerformer(filter, callback)
    performers.add(performer)

    return () => {
      performers.delete(performer)
      return performers.size === 0
    }
  }
}
