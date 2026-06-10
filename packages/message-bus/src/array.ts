import { L } from 'ts-toolbelt'

export function init<T>(array: T[]) {
  return array.slice(0, -1)
}

export function last<T extends unknown[]>(array: T): L.Last<T> {
  return array[array.length - 1]
}

export function removeItem<T>(item: T, array: T[]) {
  const index = array.indexOf(item)
  return index === -1 ? array : removeIndex(index, array)
}

export function removeIndex<T>(index: number, array: T[]) {
  return [...array.slice(0, index), ...array.slice(index + 1)]
}

export function replaceLastItem(array: never[], item: unknown): never[]
export function replaceLastItem<Ts extends unknown[], T>(
  array: Ts,
  item: T,
): L.Append<L.Pop<Ts>, T>
export function replaceLastItem<Ts extends unknown[], T>(array: Ts, item: T) {
  return array.length === 0 ? array : [...init(array), item]
}

export function filterMap<I, O, C>(
  array: I[],
  context: ContextCreator<I, C>,
  filter: Filterer<I, C>,
  map: Mapper<I, O, C>,
): O[]
export function filterMap<I, O>(
  array: I[],
  filter: Filterer<I, never>,
  map: Mapper<I, O, never>,
): O[]
export function filterMap<I, O, C>(
  array: I[],
  contextOrFilter: ContextCreator<I, C> | Filterer<I, C>,
  filterOrMap: Filterer<I, C> | Mapper<I, O, C>,
  maybeMap?: Mapper<I, O, C>,
): O[] {
  let context: undefined | ContextCreator<I, C>
  let filter: Filterer<I, C>
  let map: Mapper<I, O, C>

  if (maybeMap) {
    context = contextOrFilter as ContextCreator<I, C>
    filter = filterOrMap as Filterer<I, C>
    map = maybeMap as Mapper<I, O, C>
  } else {
    filter = contextOrFilter as Filterer<I, C>
    map = filterOrMap as Mapper<I, O, C>
  }

  const output: O[] = []
  for (const item of array) {
    const c = context?.(item)
    if (filter(item, c as any)) output.push(map(item, c as any))
  }
  return output
}

type Filterer<I, C> = C extends never
  ? (input: I) => boolean
  : (input: I, context: C) => boolean

type Mapper<I, O, C> = C extends never
  ? (input: I) => O
  : (input: I, context: C) => O

type ContextCreator<I, C> = (input: I) => C
