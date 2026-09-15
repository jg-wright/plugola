import type { Runnable } from './Runnable.js'

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

  push(item: T) {
    if (this.#running) this.#exec(item)
    else this.items.push(item)
  }

  start() {
    if (this.#running) return
    this.#running = true
    let item: T | undefined
    while (this.#running && (item = this.items.shift())) this.push(item)
  }

  stop() {
    this.#running = false
  }
}
