/**
 * Schedules the delivery of a message to a subscriber. The default delivers
 * immediately; a host can swap in its own (for example, yielding to the main
 * thread between subscribers) with {@link MessageBus.prototype.dispatcher}.
 * Subscribers registered with `{ sync: true }` bypass it.
 */
export interface Dispatcher {
  (deliver: () => void): void
}

export const dispatchImmediately: Dispatcher = (deliver) => deliver()
