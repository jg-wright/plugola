import type { Runnable } from './Runnable.ts'

export class Queue<T> implements Runnable {
  #exec: (item: T) => void
  protected readonly items: T[]

  constructor(exec: (item: T) => void, items: T[] = []) {
    this.#exec = exec
    this.items = items
  }

  #running = false
  get running() {
    return this.#running
  }

  push(...items: T[]) {
    if (this.#running) items.forEach((item) => this.#exec(item))
    else this.items.push(...items)
  }

  resume() {
    if (this.#running) return
    this.#running = true
    let item: T | undefined
    while (this.#running && (item = this.items.shift())) this.push(item)
  }

  pause() {
    this.#running = false
  }
}
