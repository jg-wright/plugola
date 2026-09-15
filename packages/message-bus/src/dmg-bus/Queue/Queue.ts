export class Queue<T> {
  #exec: (item: T) => void
  #items: T[]

  constructor(exec: (item: T) => void, items: T[] = []) {
    this.#exec = exec
    this.#items = items
  }

  #running = false
  get running() {
    return this.#running
  }

  push(item: T) {
    if (this.#running) this.#exec(item)
    else this.#items.push(item)
  }

  start() {
    this.#running = true
    let item: T | undefined
    while (this.#running && (item = this.#items.shift())) this.push(item)
  }

  stop() {
    this.#running = false
  }
}
