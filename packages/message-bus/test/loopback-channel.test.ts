import { expect, test, vi } from 'vitest'
import { LoopbackChannel } from '../src/Channel/LoopbackChannel.ts'
import type { Frame } from '../src/Channel/Channel.ts'

const ping: Frame = { kind: 'message', name: 'ping', payload: { n: 1 } }

test('a paired channel delivers each end’s send to the other end’s receivers', async () => {
  const [here, there] = LoopbackChannel.pair()
  const onThere = vi.fn()
  const onHere = vi.fn()
  there.receive(onThere)
  here.receive(onHere)

  here.send(ping)
  await Promise.resolve()

  expect(onThere).toHaveBeenCalledTimes(1)
  expect(onThere).toHaveBeenCalledWith(ping)
  expect(onHere).not.toHaveBeenCalled() // never echoes to its own receivers
})

test('delivery is deferred, not synchronous', async () => {
  const [here, there] = LoopbackChannel.pair()
  const onThere = vi.fn()
  there.receive(onThere)

  here.send(ping)
  expect(onThere).not.toHaveBeenCalled() // still queued
  await Promise.resolve()
  expect(onThere).toHaveBeenCalledTimes(1)
})

test('the received frame is a clone, not the sent object', async () => {
  const [here, there] = LoopbackChannel.pair()
  let received: Frame | undefined
  there.receive((frame) => (received = frame))

  here.send(ping)
  await Promise.resolve()

  expect(received).toEqual(ping)
  expect(received).not.toBe(ping)
})

test('every receiver on an end gets the frame', async () => {
  const [here, there] = LoopbackChannel.pair()
  const first = vi.fn()
  const second = vi.fn()
  there.receive(first)
  there.receive(second)

  here.send(ping)
  await Promise.resolve()

  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(1)
})

test('the receive disposer stops further delivery', async () => {
  const [here, there] = LoopbackChannel.pair()
  const onThere = vi.fn()
  const off = there.receive(onThere)

  off()
  here.send(ping)
  await Promise.resolve()

  expect(onThere).not.toHaveBeenCalled()
})
