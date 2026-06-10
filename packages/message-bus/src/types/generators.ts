import type { L } from 'ts-toolbelt'
import type { Matchable } from '../matcher.js'
import type Broker from '../Broker.js'
import type { AddAbortSignal, MessageBusContext } from './MessageBus.js'

export type EventGeneratorsT = Record<
  string,
  { args: unknown[]; yield: unknown }
>

export type CreateEventGenerators<T extends EventGeneratorsT> = T

export type EventGeneratorFn<Args extends unknown[], R> = (
  ...args: AddAbortSignal<Args>
) => AsyncIterable<R>

export interface EventGenerator<$ extends MessageBusContext> {
  broker: Broker<$>
  args: unknown[]
  fn: EventGeneratorFn<unknown[], unknown>
}

export type EventGeneratorArgs<A extends unknown[], R> = _EventGeneratorArgs<
  A,
  R,
  [],
  [EventGeneratorFn<A, R>]
>

export type _EventGeneratorArgs<
  A extends unknown[],
  R,
  B extends unknown[],
  Acc extends unknown[],
> =
  L.Length<A> extends 0
    ? Acc
    : _EventGeneratorArgs<
        L.Pop<A>,
        R,
        L.Prepend<B, L.Last<A>>,
        Acc | L.Append<Matchable<A>, EventGeneratorFn<B, R>>
      >

export type EventGenerators<$ extends MessageBusContext> = Partial<{
  [EventName in keyof $['generators']]: EventGenerator<$>[]
}>
