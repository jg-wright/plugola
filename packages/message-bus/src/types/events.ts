import type { L } from 'ts-toolbelt'
import type { Matcher, Matchable } from '../matcher.js'
import type Broker from '../Broker.js'
import type { CancelEvent } from '../symbols.js'
import type { AddAbortSignal, MessageBusContext } from './MessageBus.js'

export type EventsT = Record<string, unknown[]>

export type CreateEvents<T extends EventsT> = T

export type SubscriberFn<Args extends unknown[]> = (
  ...args: AddAbortSignal<Args>
) => void | Promise<void>

/**
 * Create an `.on` argument union from a list of types (value of `EventsT`).
 *
 * @example
 * type Args = SubscriberArgs<[string, number]>
 * // [string, number, SubscriberFn<[]>]
 * // | [string, SubscriberFn<[number]>]
 * // | [SubscriberFn<[string, number]>]
 */
export type SubscriberArgs<A extends unknown[]> = _SubscriberArgs<
  A,
  [],
  [SubscriberFn<A>]
>

type _SubscriberArgs<
  A extends unknown[],
  B extends unknown[],
  Acc extends unknown[],
> =
  L.Length<A> extends 0
    ? Acc
    : _SubscriberArgs<
        L.Pop<A>,
        L.Prepend<B, L.Last<A>>,
        L.Append<Matchable<A>, SubscriberFn<B>> | Acc
      >

/**
 * Create an `.until` argument union from a list of types.
 *
 * @example
 * type Args = UntilArgs<[string, number]>
 * // never[]
 * // | [string]
 * // | [string, number]
 */
export type UntilArgs<A extends unknown[]> = _UntilArgs<A, Matchable<A>>

type _UntilArgs<A extends unknown[], Acc extends unknown[]> =
  L.Length<A> extends 0 ? Acc : _UntilArgs<L.Pop<A>, Matchable<L.Pop<A>> | Acc>

/**
 * The return value of `.until` from given arguments and
 * a list of all posible types.
 *
 * @example
 * type Rtn = UntilRtn<[string, number, string], []>
 * // [string, number, string]
 * type Rtn = UntilRtn<[string, number, string], [string]>
 * // [number, string]
 * type Rtn = UntilRtn<[string, number, string], [string, number]>
 * // [string]
 * type Rtn = UntilRtn<[string, number, string], [string, number, string]>
 * // []
 */
export type UntilRtn<T extends unknown[], Args extends unknown[]> =
  L.Length<Args> extends 0
    ? T
    : L.Head<Args> extends Matcher<any>
      ? UntilRtn<L.Tail<T>, L.Tail<Args>>
      : L.Head<T> extends L.Head<Args>
        ? UntilRtn<L.Tail<T>, L.Tail<Args>>
        : never

export type Subscribers<$ extends MessageBusContext> = Partial<{
  [EventName in keyof $['events']]: Subscriber<$>[]
}>

export interface Subscriber<$ extends MessageBusContext> {
  broker: Broker<$>
  args: unknown[]
  fn: SubscriberFn<unknown[]>
}

export type EventInterceptorFn<
  Args extends unknown[],
  NewArgs extends unknown[],
> = (
  ...args: Args
) =>
  | typeof CancelEvent
  | void
  | NewArgs
  | Promise<typeof CancelEvent | void | NewArgs>

export type EventInterceptorArgs<A extends unknown[]> = _EventInterceptorArgs<
  A,
  [],
  A,
  [EventInterceptorFn<A, A>]
>

type _EventInterceptorArgs<
  A extends unknown[],
  B extends unknown[],
  C extends unknown[],
  Acc extends unknown[],
> =
  L.Length<A> extends 0
    ? Acc
    : _EventInterceptorArgs<
        L.Pop<A>,
        L.Prepend<B, L.Last<A>>,
        C,
        Acc | [...Matchable<A>, EventInterceptorFn<B, C>]
      >

export type EventInterceptors<$ extends MessageBusContext> = Partial<{
  [EventName in keyof $['events']]: EventInterceptor<$>[]
}>

export interface EventInterceptor<$ extends MessageBusContext> {
  broker: Broker<$>
  args: unknown[]
  fn: EventInterceptorFn<unknown[], unknown[]>
}
