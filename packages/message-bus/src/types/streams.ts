import { L } from 'ts-toolbelt'
import type { Matchable } from '../matcher.js'
import Broker from '../Broker.js'
import { AddAbortSignal, MessageBusContext } from './MessageBus.js'
import { UnderlyingDefaultSource } from 'node:stream/web'

export type StreamsDict = Record<string, { args: unknown[]; item: unknown }>

export type CreateStreamsDict<T extends StreamsDict> = T

export type ReaderFn<Args extends unknown[], I> = (
  ...args: AddAbortSignal<Args>
) => UnderlyingDefaultSource<I>

export interface StreamReader<
  $ extends MessageBusContext,
  StreamName extends keyof $['streams'],
> {
  broker: Broker<$>
  args: $['streams'][StreamName]['args']
  fn: ReaderFn<
    $['streams'][StreamName]['args'],
    $['streams'][StreamName]['item']
  >
}

export type Streams<$ extends MessageBusContext> = Partial<{
  [StreamName in keyof $['streams']]: StreamReader<$, StreamName>[]
}>

/**
 * Create a `.reader` argument union from a list of arguments and a return type.
 *
 * @example
 * type Args = StreamReaderArgs<[string, number], string>
 * // | [string, number, ReaderFn<[], string>]
 * // | [string, ReaderFn<[number], string>]
 * // | [ReaderFn<[string, number], string>]
 */
export type StreamReaderArgs<A extends unknown[], Item> = _StreamReaderArgs<
  A,
  Item,
  [],
  [ReaderFn<A, Item>]
>

type _StreamReaderArgs<
  A extends unknown[],
  Item,
  B extends unknown[],
  Acc extends unknown[],
> =
  L.Length<A> extends 0
    ? Acc
    : _StreamReaderArgs<
        L.Pop<A>,
        Item,
        L.Prepend<B, L.Last<A>>,
        L.Append<Matchable<A>, ReaderFn<B, Item>> | Acc
      >
