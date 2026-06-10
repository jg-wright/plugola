import type { InvokerFn, InvokerRegistrationArgs } from '@plugola/invoke'
import type Broker from '../Broker.js'
import type { L } from 'ts-toolbelt'
import type { Matchable } from '../matcher.js'
import type { MessageBusContext } from './MessageBus.js'

export {
  CreateInvokablesDict,
  InvokablesDict,
  InvokerFn,
  InvokerRegistrationArgs,
} from '@plugola/invoke'

/**
 * {@link InvokerRegistrationArgs} with matchers allowed in every filter-prefix
 * position. Invoke owns the base type and stays matcher-agnostic; we widen each
 * union member's prefix here, at the message-bus boundary.
 */
export type MatchableInvokerRegistrationArgs<
  A extends unknown[],
  Return,
> = WrapPrefix<InvokerRegistrationArgs<A, Return>>

type WrapPrefix<U extends unknown[]> = U extends [
  ...infer Pre extends unknown[],
  infer Fn,
]
  ? [...Matchable<Pre>, Fn]
  : U

export interface Invoker<
  $ extends MessageBusContext,
  Args extends unknown[],
  Return,
> {
  broker: Broker<$>
  args: Args
  fn: InvokerFn<Args, Return>
}

export type Invokers<$ extends MessageBusContext> = Partial<{
  [InvokableName in keyof $['invokables']]: Invoker<
    $,
    $['invokables'][InvokableName]['args'],
    $['invokables'][InvokableName]['return']
  >[]
}>

export type InvokerInterceptorFn<Args extends unknown[], Return> = (
  next: (...args: Args) => Promise<Return>,
  ...args: Args
) => Return | Promise<Return>

export type InvokerInterceptorArgs<
  A extends unknown[],
  Return,
> = _InvokerInterceptorArgs<A, Return, A, [InvokerInterceptorFn<A, Return>]>

export type _InvokerInterceptorArgs<
  A extends unknown[],
  Return,
  B extends unknown[],
  Acc extends unknown[],
> =
  L.Length<A> extends 0
    ? Acc
    : _InvokerInterceptorArgs<
        L.Pop<A>,
        Return,
        B,
        Acc | L.Append<Matchable<A>, InvokerInterceptorFn<B, Return>>
      >

export type InvokerInterceptors<$ extends MessageBusContext> = Partial<{
  [InvokableName in keyof $['invokables']]: InvokerInterceptor<$>[]
}>

export interface InvokerInterceptor<$ extends MessageBusContext> {
  broker: Broker<$>
  args: unknown[]
  fn: InvokerInterceptorFn<unknown[], unknown>
}
