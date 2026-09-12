import { Queue } from './Queue.js'

export class DiscriminatedQueue<
  T extends Record<PropertyKey, unknown>,
> extends Queue<DiscriminatedQueueItem<T>> {
  #execRecord: DiscriminatedQueueExecRecord<T>

  constructor(execRecord: DiscriminatedQueueExecRecord<T>) {
    super((item) => {
      execRecord[item.type](item)
    })
    this.#execRecord = execRecord
  }

  addExec<K extends PropertyKey, T>(
    type: K,
    exec: (item: T) => void,
  ): DiscriminatedQueue<T & { [P in K]: T }> {
    type NewQueue = DiscriminatedQueue<T & { [P in K]: T }>
    const newQueue = this as unknown as NewQueue
    newQueue.#execRecord[type] = exec
    return newQueue
  }
}

type DiscriminatedQueueItem<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T]: { type: K } & T[K]
}[keyof T]

type DiscriminatedQueueExecRecord<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T]: (item: T[K]) => void
}
