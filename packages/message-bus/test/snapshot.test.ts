import { expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'

const Ping = message('ping')
const Call = command<{}, number>('call')

test('a responder registered while a command is in flight does not answer it', async () => {
  const bus = new MessageBus()
  const a = bus.gateway('a')
  const caller = bus.gateway('caller')
  a.register(Call, (_, { send }) => {
    bus.gateway('late').register(Call, (_, { send }) => send(2))
    a.register(Call, (_, { send }) => send(3))
    send(1)
  })
  bus.resume()

  expect(await caller.invoke(Call()).collect()).toEqual([1])
})

test('a subscriber added while a message is delivered does not receive it', () => {
  const bus = new MessageBus()
  const a = bus.gateway('a')
  const sender = bus.gateway('sender')
  const late = vi.fn()
  a.once(Ping, () => {
    a.on(Ping, late)
    bus.gateway('late').on(Ping, late)
  })
  bus.resume()

  sender.emit(Ping())

  expect(late).not.toHaveBeenCalled()
})
