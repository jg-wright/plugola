import { EventClass, InvocationClass, InvocationType } from './Event.js'

export interface EventListener<E extends EventClass> {
  (event: InstanceType<E>): void | Promise<void>
}

export interface InvocationListener<E extends InvocationClass<unknown>> {
  (
    event: InstanceType<E>,
    context: InvocationListenerContext<E>,
  ): void | Promise<void>
}

export interface InvocationListenerContext<E extends InvocationClass<unknown>> {
  send: (value: InvocationType<E>) => void
  finish: () => void
  signal?: AbortSignal
}

export const CANCEL = Symbol.for('dmg-bus/cancel')

export type InterceptionResult<E extends EventClass> =
  | void
  | InstanceType<E>
  | typeof CANCEL
  | Promise<InterceptionResult<E>>

export interface InterceptionListener<E extends EventClass> {
  (event: InstanceType<E>): InterceptionResult<E>
}
