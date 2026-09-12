import { Broker, ListenableBroker } from './Broker.js'
import { Event, Invocation, InvocationType } from './Event.js'
import { queueMethod } from './queuedMethods.js'

export class PluginBroker implements ListenableBroker {
  #broker: Broker
  #invoke: Broker['invoke']

  emit: Broker['emit']
  on: ListenableBroker['on']
  once: ListenableBroker['once']
  until: ListenableBroker['until']
  register: ListenableBroker['register']

  get abortSignal() {
    return this.#broker.abortSignal
  }

  constructor(broker: Broker) {
    this.#broker = broker

    this.#invoke = queueMethod(
      this.#broker.queue,
      (
        event: Invocation<unknown>,
        context: {
          send(value: any): void
          finish(): void
          signal?: AbortSignal
        },
      ) => {
        broker.bus.emit(event)
        broker.bus.invoke(event, context)
      },
    )

    this.on = broker.on.bind(broker)
    this.once = broker.once.bind(broker)
    this.until = broker.until.bind(broker)
    this.register = broker.register.bind(broker)

    this.emit = queueMethod(this.#broker.queue, (event: Event) => {
      broker.bus.emit(event)
    })
  }

  start(name: string) {
    this.#broker.bus.start(name)
  }

  stop(name: string) {
    this.#broker.bus.stop(name)
  }

  abort(name: string, reason?: any) {
    this.#broker.bus.abort(name, reason)
  }

  invoke<E extends Invocation<unknown>>(
    event: E,
    {
      signal,
    }: {
      signal?: AbortSignal
    } = {},
  ): {
    collect(): Promise<InvocationType<E>[]>
    iterate(): AsyncIterable<InvocationType<E>, undefined>
    promise(): Promise<void>
  } {
    type T = InvocationType<E>

    const readableStream = new ReadableStream<T>({
      start: (controller) => {
        const abort = () => controller.error(this.abortSignal.reason)
        const close = () => controller.close()

        if (this.abortSignal.aborted) return abort()
        if (signal?.aborted) return close()

        this.abortSignal.addEventListener('abort', abort)
        signal?.addEventListener('abort', close)

        this.#invoke(event, {
          send: (value: T) => controller.enqueue(value),
          finish: () => {
            this.abortSignal.removeEventListener('abort', abort)
            signal?.removeEventListener('abort', close)
            controller.close()
          },
          signal,
        })
      },
    })

    return {
      async collect() {
        const items: T[] = []
        for await (const item of readableStream) items.push(item)
        return items
      },

      iterate: () => readableStream.values(),

      promise: async (concurrency = 10) => {
        const reader = readableStream.getReader()
        let item = await reader.read()
        for (let i = 0; i < concurrency && !item.done; i++) {
          while ((item = await reader.read()) && !item.done) {}
        }
      },
    }
  }
}
