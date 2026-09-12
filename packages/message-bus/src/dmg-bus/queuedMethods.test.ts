import { expect, test, vi } from 'vitest'
import { queuedMethods } from './queuedMethods.js'
import { Queue } from './Queue.js'

const Test = queuedMethods(
  ['foo'],
  class Test {
    $queue!: Queue<any>

    foo(spy: () => void) {
      spy()
    }

    bar(spy: () => void) {
      spy()
    }
  },
)

test('doesnt affect bar', () => {
  const t = new Test()
  const spy = vi.fn()
  t.bar(spy)
  expect(spy).toHaveBeenCalled()
})

test('queues configured methods', () => {
  const t = new Test()
  const spy = vi.fn()

  t.foo(spy)
  expect(spy).not.toHaveBeenCalled()

  t.$queue.start()
  expect(spy).toHaveBeenCalled()
})
