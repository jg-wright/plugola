import { expect, test, vi } from 'vitest'
import Logger from '../src/Logger.js'
import type LoggerBehavior from '../src/LoggerBehavior.js'

test('labels each message', () => {
  const behavior = fakeBehavior()
  new Logger('ads', behavior).info('hello')
  expect(behavior.info).toHaveBeenCalledWith('[ads]', 'hello')
})

test('extending adds to the label and keeps the name', () => {
  const behavior = fakeBehavior()
  const log = new Logger('ads', behavior).extend('slots')
  log.warn('none')
  expect(log.name).toBe('ads')
  expect(behavior.warn).toHaveBeenCalledWith('[ads][slots]', 'none')
})

test('methods can be passed as callbacks', async () => {
  const behavior = fakeBehavior()
  const { error, extend } = new Logger('ads', behavior)
  await Promise.reject(new Error('oops')).catch(error)
  extend('sub').info('x')
  expect(behavior.error).toHaveBeenCalledWith('[ads]', new Error('oops'))
  expect(behavior.info).toHaveBeenCalledWith('[ads][sub]', 'x')
})

function fakeBehavior() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    table: vi.fn(),
    time: vi.fn(),
    timeEnd: vi.fn(),
    warn: vi.fn(),
  } satisfies LoggerBehavior
}
