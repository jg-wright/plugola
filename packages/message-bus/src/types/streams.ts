import { L } from 'ts-toolbelt'
import Broker from '../Broker.js'
import { AddAbortSignal } from './MessageBus.js'
import { UnderlyingDefaultSource } from 'node:stream/web'

export type StreamsDict = Record<string, { args: unknown[]; item: unknown }>

export type CreateStreamsDict<T extends StreamsDict> = T

export type ReaderFn<Args extends unknown[], I> = (
  ...args: AddAbortSignal<Args>
) => UnderlyingDefaultSource<I>

export interface StreamReader<B extends Broker, Args extends unknown[], Item> {
  broker: B
  args: Args
  fn: ReaderFn<Args, Item>
}

export type Streams<Streamables extends StreamsDict> = Partial<{
  [StreamName in keyof Streamables]: StreamReader<
    Broker,
    Streamables[StreamName]['args'],
    Streamables[StreamName]['item']
  >[]
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
        L.Append<A, ReaderFn<B, Item>> | Acc
      >
