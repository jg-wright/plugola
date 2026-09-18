import type { Message, MessageClass } from '../Message/Message.js'
import type {
  CommandMessage,
  CommandMessageClass,
} from '../Message/CommandMessage.js'
import type { Subscriber } from '../Roles/Subscriber.js'
import type { Interceptor } from '../Roles/Interceptor.js'
import type { Responder } from '../Roles/Responder.js'
import type { Filter } from '../Filter.js'
import { getOrInsert } from '../lang/Map.js'
import { SelectivePerformer } from './SelectivePerformer.js'

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
  readonly addSubscriber = <M extends MessageClass>(
    messageClass: M,
    filter: Filter<M>,
    subscriber: Subscriber<M>,
  ) => this.#add(this.#subscribers, messageClass, filter, subscriber)

  readonly addResponder = <E extends CommandMessageClass<unknown>>(
    commandClass: E,
    filter: Filter<E>,
    responder: Responder<E>,
  ) => this.#add(this.#responders, commandClass, filter, responder)

  readonly addInterceptor = <M extends MessageClass>(
    messageClass: M,
    filter: Filter<M>,
    interceptor: Interceptor<M>,
  ) => this.#add(this.#interceptors, messageClass, filter, interceptor)

  subscribersFor(messageClass: MessageClass) {
    return this.#subscribers.get(messageClass)
  }

  respondersFor(commandClass: CommandMessageClass<unknown>) {
    return this.#responders.get(commandClass)
  }

  interceptorsFor(messageClass: MessageClass) {
    return this.#interceptors.get(messageClass)
  }

  /** Drops every registered performer; used when the participant is aborted. */
  clear() {
    this.#subscribers.clear()
    this.#responders.clear()
    this.#interceptors.clear()
  }

  readonly #subscribers = new Map<
    MessageClass,
    Set<SelectivePerformer<Message>>
  >()

  readonly #responders = new Map<
    CommandMessageClass,
    Set<SelectivePerformer<CommandMessage>>
  >()

  readonly #interceptors = new Map<
    MessageClass,
    Set<SelectivePerformer<Message>>
  >()

  #add(
    registry: Map<any, Set<SelectivePerformer<any>>>,
    messageClass: unknown,
    filter: Filter<MessageClass>,
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
