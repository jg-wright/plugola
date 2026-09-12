import { EventClass } from './Event.js'

export type Filter<E extends EventClass> = {
  [K in keyof InstanceType<E>]?: FilterValue<E, K>
}

export type FilterEntry<E extends EventClass> = {
  [K in keyof InstanceType<E>]: [K, FilterValue<E, K>]
}[keyof InstanceType<E>]

export type FilterEntries<E extends EventClass> = FilterEntry<E>[]

export type FilterValue<
  E extends EventClass,
  K extends keyof InstanceType<E>,
> = InstanceType<E>[K] | FilterPredicate<E>

export interface FilterPredicate<E extends EventClass> {
  (event: InstanceType<E>): boolean
}
