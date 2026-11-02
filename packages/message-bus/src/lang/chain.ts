import { CANCEL } from '../Roles/Interceptor.ts'

/**
 * Threads `value` through each of `steps` in turn: a step may return a
 * replacement value, {@link CANCEL} to stop, or nothing to pass the value on
 * unchanged. Stays synchronous for as long as every step returns
 * synchronously, so a chain of synchronous interceptors doesn't defer
 * delivery, and only becomes a promise at the first step that returns one.
 */
export function chain<T, S>(
  steps: readonly S[],
  value: T,
  run: (step: S, value: T) => unknown,
  from = 0,
): T | typeof CANCEL | Promise<T | typeof CANCEL> {
  for (let i = from; i < steps.length; i++) {
    const result = run(steps[i]!, value)
    if (isPromiseLike(result))
      return Promise.resolve(result).then((resolved) =>
        resolved === CANCEL
          ? CANCEL
          : chain(steps, (resolved || value) as T, run, i + 1),
      )
    if (result === CANCEL) return CANCEL
    if (result) value = result as T
  }
  return value
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}
