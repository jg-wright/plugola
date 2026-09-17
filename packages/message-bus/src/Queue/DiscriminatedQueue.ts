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

  /**
   * Registers an executor for a new discriminant, mutating this queue in place
   * and returning it (widened) rather than allocating a replacement. Mutating is
   * deliberate: a fresh instance would start out stopped and silently drop the
   * running state, so a discriminant added after start() would never run.
   */
  addExec<K extends PropertyKey, U>(
    type: K,
    exec: (item: U) => void,
  ): DiscriminatedQueue<T & { [P in K]: U }> {
    ;(this.#execRecord as Record<PropertyKey, (item: any) => void>)[type] = exec
    return this as unknown as DiscriminatedQueue<T & { [P in K]: U }>
  }
}

type DiscriminatedQueueItem<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T]: { type: K } & T[K]
}[keyof T]

type DiscriminatedQueueExecRecord<T extends Record<PropertyKey, unknown>> = {
  [K in keyof T]: (item: T[K]) => void
}
