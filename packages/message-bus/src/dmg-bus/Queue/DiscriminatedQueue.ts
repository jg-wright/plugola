import { Queue } from './Queue.js'

export class DiscriminatedQueue<
  T extends Record<PropertyKey, unknown>,
> extends Queue<DiscriminatedQueueItem<T>> {
  #execRecord: DiscriminatedQueueExecRecord<T>

  constructor(
    execRecord: DiscriminatedQueueExecRecord<T>,
    items?: DiscriminatedQueueItem<T>[],
  ) {
    super((item) => {
      execRecord[item.type](item)
    }, items)
    this.#execRecord = execRecord
  }

  addExec<K extends PropertyKey, T>(
    type: K,
    exec: (item: T) => void,
  ): DiscriminatedQueue<T & { [P in K]: T }> {
    type NewT = T & { [P in K]: T }
    return new DiscriminatedQueue<NewT>(
      {
        ...this.#execRecord,
        [type]: exec,
      },
      this.items as unknown as DiscriminatedQueueItem<NewT>[],
    )
  }
}

type DiscriminatedQueueItem<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T]: { type: K } & T[K]
}[keyof T]

type DiscriminatedQueueExecRecord<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T]: (item: T[K]) => void
}
