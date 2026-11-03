import { expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'
import { CANCEL } from '../src/Roles/Interceptor.ts'
import type { BusEvent } from '../src/Roles/Observer.ts'

const Ping = message<{ n: number }>('ping')
const Call = command<{}, number>('call')

test('observers see emits, deliveries and responses', async () => {
  const bus = new MessageBus()
  const a = bus.gateway('a')
  const b = bus.gateway('b')
  const events: BusEvent[] = []
  bus.observe((event) => events.push(event))
  b.on(Ping, () => {})
  b.register(Call, (_, { send }) => send(1))
  bus.resume()

  await a.emit(Ping({ n: 1 }))
  await a.invoke(Call()).collect()

  expect(
    events.map(({ type, ...rest }) => [
      type,
      'from' in rest ? rest.from : (rest as any).to,
    ]),
  ).toEqual([
    ['emit', 'a'],
    ['deliver', 'b'],
    ['emit', 'a'],
    ['respond', 'b'],
  ])
})

test('observers see cancelled messages', async () => {
  const bus = new MessageBus()
  const a = bus.gateway('a')
  const observer = vi.fn()
  bus.observe(observer)
  a.intercept(Ping, () => CANCEL)
  bus.resume()

  await a.emit(Ping({ n: 1 }))

  expect(observer).toHaveBeenLastCalledWith({
    type: 'cancel',
    message: expect.objectContaining({ n: 1 }),
  })
})

test('an observer can be removed', async () => {
  const bus = new MessageBus()
  const a = bus.gateway('a')
  const observer = vi.fn()
  bus.observe(observer)()
  bus.resume()

  await a.emit(Ping({ n: 1 }))

  expect(observer).not.toHaveBeenCalled()
})
