import { expect, test, vi } from 'vitest'
import { DiscriminatedQueue } from '../src/DiscriminatedQueue.ts'
import { MethodQueue } from '../src/MethodQueue.ts'
import { Queue } from '../src/Queue.ts'

test('discriminated queue', () => {
  const fooSpy = vi.fn((_item: { name: string }) => {})
  const barSpy = vi.fn((_item: { num: number }) => {})

  const queue = new DiscriminatedQueue({
    foo: fooSpy,
    bar: barSpy,
  })

  queue.push({ type: 'foo', name: 'My name' })
  queue.push({ type: 'bar', num: 123 })

  expect(fooSpy).not.toHaveBeenCalled()
  expect(barSpy).not.toHaveBeenCalled()

  queue.resume()

  expect(fooSpy).toHaveBeenCalledWith({ type: 'foo', name: 'My name' })
  expect(barSpy).toHaveBeenCalledWith({ type: 'bar', num: 123 })
})

test('Queue buffers while paused and drains in FIFO order on resume', () => {
  const seen: number[] = []
  const queue = new Queue<number>((n) => seen.push(n))
  queue.push(1)
  queue.push(2)
  queue.push(3)
  expect(seen).toEqual([])
  queue.resume()
  expect(seen).toEqual([1, 2, 3])
})

test('Queue executes immediately once running', () => {
  const seen: number[] = []
  const queue = new Queue<number>((n) => seen.push(n))
  queue.resume()
  queue.push(1)
  expect(seen).toEqual([1])
})

test('Queue stops draining when paused mid-flight', () => {
  const seen: number[] = []
  const queue = new Queue<number>((n) => {
    seen.push(n)
    if (n === 2) queue.pause()
  })
  queue.push(1)
  queue.push(2)
  queue.push(3)
  queue.resume()
  expect(seen).toEqual([1, 2])
})

test('MethodQueue defers a call until resumed, then runs it', () => {
  const queue = new MethodQueue()
  const spy = vi.fn((a: number, b: number) => a + b)
  const call = queue.queueMethod(spy)
  call(2, 3)
  expect(spy).not.toHaveBeenCalled()
  queue.resume()
  expect(spy).toHaveBeenCalledWith(2, 3)
})

test('MethodQueue preserves running state when a method is queued after resume', () => {
  const queue = new MethodQueue()
  queue.resume()
  expect(queue.running).toBe(true)
  queue.queueMethod(() => {})
  expect(queue.running).toBe(true)
})

test('MethodQueue runs a method queued after resume immediately', () => {
  const queue = new MethodQueue()
  queue.resume()
  const spy = vi.fn()
  const call = queue.queueMethod(spy)
  call('hi')
  expect(spy).toHaveBeenCalledWith('hi')
})

test('MethodQueue methods queued before and after resume share running state', () => {
  const queue = new MethodQueue()
  const early = vi.fn()
  const callEarly = queue.queueMethod(early)
  const late = vi.fn()
  const callLate = queue.queueMethod(late)
  callEarly('a')
  queue.resume()
  callLate('b')
  expect(early).toHaveBeenCalledWith('a')
  expect(late).toHaveBeenCalledWith('b')
})
