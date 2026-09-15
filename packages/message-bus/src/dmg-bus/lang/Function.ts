export function withCounter<Args extends unknown[], R>(
  start: number,
  fn: (counter: number, ...args: Args) => R,
): (...args: Args) => R

export function withCounter<Args extends unknown[], R>(
  fn: (counter: number, ...args: Args) => R,
): (...args: Args) => R

export function withCounter<Args extends unknown[], R>(
  startOrFn: number | ((counter: number, ...args: Args) => R),
  fn?: (counter: number, ...args: Args) => R,
): (...args: Args) => R {
  let counter = (fn ? startOrFn : 1) as number
  fn ??= startOrFn as (counter: number, ...args: Args) => R
  return (...args) => fn(counter++, ...args)
}
