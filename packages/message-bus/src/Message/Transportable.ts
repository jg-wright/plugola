import { type Codec, defaultEncode } from './Codec.ts'

export function TransportableMixin<
  C extends abstract new (...args: any[]) => any,
>(
  Class: C,
  codec?: Partial<Codec<InstanceType<C>>>,
): C & Transportable<InstanceType<C>> {
  abstract class TransportableMixin extends Class {
    static readonly $encode = codec?.encode ?? defaultEncode
    static $decode(payload: any): InstanceType<C> {
      if (codec?.decode) return codec.decode(payload)
      return new (this as unknown as new (payload: any) => InstanceType<C>)(
        payload,
      )
    }
  }

  return TransportableMixin
}

export interface Transportable<T> {
  $encode(message: T): unknown
  $decode(payload: unknown): T
}
