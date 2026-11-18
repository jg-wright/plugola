import { expect, test, vi } from 'vitest'
import { Asyncable } from '../src/Asyncable.ts'
import { Queue } from '../src/Queue.ts'

vi.useFakeTimers()

test('ordered asynchronous queue', async () => {
  const Q = Asyncable(Queue)
  const q = new Q((item: () => Promise<void>) => item())
  const fn = vi.fn()
  q.push(() => delay(10, 'a').then(fn))
  q.push(() => delay(5, 'b').then(fn))
  q.push(() => fn('c'))
  await vi.runAllTimersAsync()
  expect(fn).not.toHaveBeenCalled()
  q.resume()
  await vi.runAllTimersAsync()
  expect(fn.mock.calls).toEqual([['a'], ['b'], ['c']])
})

test('pause holds items already chained until resume', async () => {
  const Q = Asyncable(Queue)
  const q = new Q((item: () => unknown) => item())
  const fn = vi.fn()
  q.push(() =>
    delay(10, 'a')
      .then(fn)
      .then(() => q.pause()),
  )
  q.push(() => fn('b'))
  q.push(() => fn('c'))
  q.resume()
  await vi.runAllTimersAsync()
  expect(fn.mock.calls).toEqual([['a']])
  q.push(() => fn('d'))
  q.resume()
  await vi.runAllTimersAsync()
  expect(fn.mock.calls).toEqual([['a'], ['b'], ['c'], ['d']])
})

test('onError receives failures and the queue carries on', async () => {
  const onError = vi.fn()
  const Q = Asyncable(Queue, onError)
  const q = new Q((item: () => unknown) => item())
  const fn = vi.fn()
  const error = new Error('boom')
  q.push(() => delay(5, 'a').then(fn))
  q.push(() => Promise.reject(error))
  q.push(() => {
    throw error
  })
  q.push(() => fn('b'))
  q.resume()
  await vi.runAllTimersAsync()
  expect(onError.mock.calls).toEqual([[error], [error]])
  expect(fn.mock.calls).toEqual([['a'], ['b']])
})

function delay<T>(ms: number, value: T) {
  return new Promise<T>((resolve) => setTimeout(resolve, ms, value))
}
