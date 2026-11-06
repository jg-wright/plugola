import { describe, expect, test, vi } from 'vitest'
import { MessageBus } from '../src/MessageBus.ts'
import { CANCEL } from '../src/Roles/Interceptor.ts'
import { message } from '../src/Message/Message.ts'
import { command } from '../src/Message/CommandMessage.ts'

describe('resuming the bus', () => {
  test('a message emitted before resume passes through interceptors of participants created after its sender', () => {
    const bus = new MessageBus()
    const sender = bus.gateway('sender')
    const subscriber = vi.fn()
    bus.gateway('subscriber').on(Ping, subscriber)
    bus.gateway('later').intercept(Ping, () => CANCEL)

    sender.emit(Ping())
    bus.resume()

    expect(subscriber).not.toHaveBeenCalled()
  })

  test('a message emitted by a handler of a buffered message passes through interceptors of participants created later', () => {
    const bus = new MessageBus()
    const mounter = bus.gateway('mounter')
    const definer = bus.gateway('definer')
    const subscriber = vi.fn()
    bus.gateway('subscriber').on(Defined, subscriber)
    definer.on(Mounted, () => {
      definer.emit(Defined())
    })
    bus.gateway('lazy').intercept(Defined, () => CANCEL)

    mounter.emit(Mounted())
    bus.resume()

    expect(subscriber).not.toHaveBeenCalled()
  })

  test('buffered messages are delivered in the order they were emitted', () => {
    const bus = new MessageBus()
    const first = bus.gateway('first')
    const second = bus.gateway('second')
    const received: string[] = []
    bus.gateway('subscriber').on(Named, ({ name }) => {
      received.push(name)
    })

    second.emit(Named({ name: 'second:1' }))
    first.emit(Named({ name: 'first:1' }))
    second.emit(Named({ name: 'second:2' }))
    bus.resume()

    // Each participant's buffer replays in turn, in the order the participants
    // were created.
    expect(received).toEqual(['first:1', 'second:1', 'second:2'])
  })

  test('a command invoked before resume reaches responders of participants created after its invoker', async () => {
    const bus = new MessageBus()
    const invoker = bus.gateway('invoker')
    bus.gateway('later').register(Ask, (_, { send }) => send('answer'))

    const answers = invoker.invoke(Ask()).collect()
    bus.resume()

    expect(await answers).toEqual(['answer'])
  })

  test('a participant created while the bus resumes is resumed too', () => {
    const bus = new MessageBus()
    const creator = bus.gateway('creator')
    const subscriber = vi.fn()
    creator.on(Mounted, () => {
      bus.gateway('created').on(Defined, subscriber)
      creator.emit(Defined())
    })
    bus.gateway('mounter').emit(Mounted())

    bus.resume()

    expect(subscriber).toHaveBeenCalledTimes(1)
  })
})

const Ping = message('ping')
const Mounted = message('mounted')
const Defined = message('defined')
const Named = message<{ name: string }>('named')
const Ask = command<{}, string>('ask')
