export function onAbort(
  fn: (reason: any) => any,
  signal?: AbortSignal,
): { aborted: boolean; off(): void } {
  const $fn = () => fn(signal?.reason)
  const aborted = !!signal?.aborted

  if (aborted) {
    $fn()
    return { aborted, off: () => {} }
  }

  signal?.addEventListener('abort', $fn, { once: true })
  return { aborted, off: () => signal?.removeEventListener('abort', $fn) }
}
