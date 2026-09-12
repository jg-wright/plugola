import { expect, test, vi } from 'vitest'
import { DiscriminatedQueue } from './DiscriminatedQueue.js'

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
