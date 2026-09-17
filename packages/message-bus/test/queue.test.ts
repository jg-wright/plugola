import { expect, test, vi } from 'vitest'
import { DiscriminatedQueue } from '../src/Queue/DiscriminatedQueue.js'
import { MethodQueue } from '../src/Queue/MethodQueue.js'
import { Queue } from '../src/Queue/Queue.js'

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

  queue.start()

  expect(fooSpy).toHaveBeenCalledWith({ type: 'foo', name: 'My name' })
  expect(barSpy).toHaveBeenCalledWith({ type: 'bar', num: 123 })
})

test('Queue buffers while stopped and drains in FIFO order on start', () => {
  const seen: number[] = []
  const queue = new Queue<number>((n) => seen.push(n))
  queue.push(1)
  queue.push(2)
  queue.push(3)
  expect(seen).toEqual([])
  queue.start()
  expect(seen).toEqual([1, 2, 3])
})

test('Queue executes immediately once running', () => {
  const seen: number[] = []
  const queue = new Queue<number>((n) => seen.push(n))
  queue.start()
  queue.push(1)
  expect(seen).toEqual([1])
})

test('Queue stops draining when stopped mid-flight', () => {
  const seen: number[] = []
  const queue = new Queue<number>((n) => {
    seen.push(n)
    if (n === 2) queue.stop()
  })
  queue.push(1)
  queue.push(2)
  queue.push(3)
  queue.start()
  expect(seen).toEqual([1, 2])
})

test('MethodQueue defers a call until started, then runs it', () => {
  const queue = new MethodQueue()
  const spy = vi.fn((a: number, b: number) => a + b)
  const call = queue.queueMethod(spy)
  call(2, 3)
  expect(spy).not.toHaveBeenCalled()
  queue.start()
  expect(spy).toHaveBeenCalledWith(2, 3)
})

test('MethodQueue preserves running state when a method is queued after start', () => {
  const queue = new MethodQueue()
  queue.start()
  expect(queue.running).toBe(true)
  queue.queueMethod(() => {})
  expect(queue.running).toBe(true)
})

test('MethodQueue runs a method queued after start immediately', () => {
  const queue = new MethodQueue()
  queue.start()
  const spy = vi.fn()
  const call = queue.queueMethod(spy)
  call('hi')
  expect(spy).toHaveBeenCalledWith('hi')
})

test('MethodQueue methods queued before and after start share running state', () => {
  const queue = new MethodQueue()
  const early = vi.fn()
  const callEarly = queue.queueMethod(early)
  queue.start()
  const late = vi.fn()
  const callLate = queue.queueMethod(late)
  callEarly('a')
  callLate('b')
  expect(early).toHaveBeenCalledWith('a')
  expect(late).toHaveBeenCalledWith('b')
})
