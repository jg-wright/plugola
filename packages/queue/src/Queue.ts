import type { Runnable } from './Runnable.ts'

export class Queue<T, R = void> implements Runnable {
  #exec: (item: T) => R
  protected readonly items: T[]

  constructor(exec: (item: T) => R, items: T[] = []) {
    this.#exec = exec
    this.items = items
  }

  #running = false
  get running() {
    return this.#running
  }

  push(...items: T[]) {
    this.execItems(this.#exec, items)
    if (items.length) this.items.push(...items)
  }

  resume() {
    if (this.#running) return
    this.#running = true
    this.execItems(this.#exec, this.items)
  }

  pause() {
    this.#running = false
  }

  protected execItems(exec: (item: T) => R, items: T[]) {
    while (this.#running && items.length > 0) exec(items.shift()!)
  }
}
