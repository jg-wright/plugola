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
    while (this.#running && this.items.length > 0)
      this.push(this.items.shift()!)
  }

  pause() {
    this.#running = false
  }
}
