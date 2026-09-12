export interface Event {
  readonly $name: string
}

export type EventClass<E extends Event = Event> = abstract new (
  ...args: any[]
) => E

export abstract class Invocation<T> implements Event {
  abstract $name: string
  declare $invocationType: T
}

export type InvocationClass<T> = abstract new (...args: any) => Invocation<T>

export type InvocationType<E extends Invocation<any> | InvocationClass<any>> =
  E extends Invocation<infer V>
    ? V
    : E extends InvocationClass<infer V>
      ? V
      : never
