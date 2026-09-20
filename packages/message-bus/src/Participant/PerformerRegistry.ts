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
import type { Performer } from '../Roles/Performer.ts'

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
    messageFactory: M,
    filter: Filter<M>,
    subscriber: Subscriber<M>,
  ) => this.#add(this.#subscribers, messageFactory, filter, subscriber)

  readonly addResponder = <E extends CommandMessageFactory>(
    commandFactory: E,
    filter: Filter<E>,
    responder: Responder<E>,
  ) => this.#add(this.#responders, commandFactory, filter, responder)

  readonly addInterceptor = <M extends MessageFactory>(
    messageFactory: M,
    filter: Filter<M>,
    interceptor: Interceptor<M>,
  ) => this.#add(this.#interceptors, messageFactory, filter, interceptor)

  subscribersFor(messageFactory: MessageFactory) {
    return this.#subscribers.get(messageFactory)
  }

  respondersFor(commandFactory: CommandMessageFactory) {
    return this.#responders.get(commandFactory)
  }

  interceptorsFor(messageFactory: MessageFactory) {
    return this.#interceptors.get(messageFactory)
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
    messageFactory: MessageFactory,
    filter: Filter<MessageFactory>,
    callback: (...args: any[]) => any,
  ): () => boolean {
    const performers = getOrInsert(registry, messageFactory, new Set())
    const performer = new SelectivePerformer(filter, callback)
    performers.add(performer)

    return () => {
      performers.delete(performer)
      return performers.size === 0
    }
  }
}

export interface PerformerRegistrator<
  M extends MessageFactory = MessageFactory,
> {
  (messageFactory: M, filter: Filter<M>, responder: Performer<M>): () => boolean
}
