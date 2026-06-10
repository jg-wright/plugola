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
  context: (input: I) => C,
  filter: (input: I, context: C) => boolean,
  map: (input: I, context: C) => O,
): O[]
export function filterMap<I, O>(
  array: I[],
  filter: (input: I) => I,
  map: (input: I) => O,
): O[]
export function filterMap<I, O, C>(
  array: I[],
  contextOrFilter: ((input: I) => C) | ((input: I, context: C) => boolean),
  filterOrMap:
    | ((input: I, context: C) => boolean)
    | ((input: I, context: C) => O),
  maybeMap?: (input: I, context: C) => O,
): O[] {
  type GetContext = (input: I) => C
  type Filter = (input: I, context: C) => boolean
  type Map = (input: I, context: C) => O

  let context: undefined | GetContext
  let filter: Filter
  let map: Map

  if (maybeMap) {
    context = contextOrFilter as GetContext
    filter = filterOrMap as Filter
    map = maybeMap as Map
  } else {
    filter = contextOrFilter as Filter
    map = filterOrMap as Map
  }

  const output: O[] = []
  for (const item of array) {
    const c = context?.(item)
    if (filter(item, c as any)) output.push(map(item, c as any))
  }
  return output
}
