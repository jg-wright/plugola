/**
 * Whether a message reached this bus from a transport (a bridge's channel, or
 * any other adapter that marks what it decodes). Such a message is never
 * relayed on, by any bridge or adapter on the bus, so there are no echoes.
 */
export function isFromWire(message: object): boolean {
  return (message as Record<symbol, unknown>)[FROM_WIRE] === true
}

/**
 * Tags a decoded message as wire-originated. The tag is shared by every bridge
 * and adapter, so none of them relays the message on. Returns the message.
 */
export function markFromWire<M extends object>(message: M): M {
  ;(message as Record<symbol, unknown>)[FROM_WIRE] = true
  return message
}

const FROM_WIRE = Symbol('fromWire')
