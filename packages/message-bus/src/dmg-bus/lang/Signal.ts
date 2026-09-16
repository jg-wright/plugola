export const CANCELLED = Symbol.for('dmg-bus/cancelled')

export function timeout<T>(
  ms: number,
  signal: AbortSignal | undefined,
  value: T,
): Promise<T | typeof CANCELLED>

export function timeout<T>(
  ms: number,
  signal?: AbortSignal,
): Promise<void | typeof CANCELLED>

export function timeout<T>(
  ms: number,
  signal?: AbortSignal,
  value?: T,
): Promise<T | void | typeof CANCELLED> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(CANCELLED)
    signal?.addEventListener('abort', () => resolve(CANCELLED))
    setTimeout(() => resolve(value), ms)
  })
}
