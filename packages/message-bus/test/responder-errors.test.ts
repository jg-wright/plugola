import { expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { command } from '../src/Message/CommandMessage.ts'

const Call = command<{}, number>('call')

function setup(bus: MessageBus) {
  const caller = bus.gateway('caller')
  bus.gateway('broken').register(Call, () => {
    throw new Error('broken')
  })
  bus.gateway('healthy').register(Call, (_, { send }) => send(1))
  bus.resume()
  return caller
}

test('a responder error fails the invoke by default', async () => {
  const caller = setup(new MessageBus())

  await expect(caller.invoke(Call()).collect()).rejects.toThrow('broken')
})

test('onResponderError isolates responders when an invoke has no onError', async () => {
  const onResponderError = vi.fn()
  const caller = setup(new MessageBus({ onResponderError }))

  expect(await caller.invoke(Call()).collect()).toEqual([1])
  expect(onResponderError).toHaveBeenCalledWith(new Error('broken'))
})

test("an invoke's onError takes precedence over onResponderError", async () => {
  const onResponderError = vi.fn()
  const onError = vi.fn()
  const caller = setup(new MessageBus({ onResponderError }))

  await caller.invoke(Call(), { onError }).collect()

  expect(onError).toHaveBeenCalledOnce()
  expect(onResponderError).not.toHaveBeenCalled()
})
