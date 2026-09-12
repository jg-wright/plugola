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
  send: (value: InvocationType<E>) => unknown
  finish: () => unknown
  signal?: AbortSignal
}
