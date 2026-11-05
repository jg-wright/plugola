import type { Message } from '../Message/Message.ts'
import type { CommandMessage } from '../Message/CommandMessage.ts'

/**
 * Something that happened to a message on a {@link MessageBus}, as seen by a
 * {@link BusObserver}:
 *
 * - `emit` — a participant (`from`, when emitted through a gateway) put the
 *   message on the bus; commands are emitted before they are invoked, with
 *   `invoked: true`;
 * - `cancel` — an interceptor cancelled it;
 * - `deliver` — it reached a participant's (`to`) subscribers;
 * - `respond` — a command reached a participant's (`to`) responders.
 */
export type BusEvent =
  | { type: 'emit'; message: Message; from?: string; invoked: boolean }
  | { type: 'cancel'; message: Message }
  | { type: 'deliver'; message: Message; to: string }
  | { type: 'respond'; message: CommandMessage; to: string }

/** Registered with {@link MessageBus.prototype.observe}. */
export interface BusObserver {
  (event: BusEvent): void
}
