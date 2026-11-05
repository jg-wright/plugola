import LoggerBehavior from './LoggerBehavior.js'
import { TabularData } from './types.js'

/**
 * A labelled logger. Its methods are bound, so they can be passed around as
 * callbacks (e.g. `promise.catch(log.error)`).
 */
export default class Logger {
  readonly #behaviors: LoggerBehavior[]
  readonly #label: string
  readonly #name: string

  constructor(
    name: string,
    behaviors: LoggerBehavior | LoggerBehavior[],
    label: string = `[${name}]`,
  ) {
    this.#behaviors = Array.isArray(behaviors) ? behaviors : [behaviors]
    this.#label = label
    this.#name = name
  }

  get name() {
    return this.#name
  }

  readonly debug = (...args: any[]) => {
    this.#behaviors.forEach((b) => b.debug(this.#label, ...args))
  }

  readonly error = (...args: any[]) => {
    this.#behaviors.forEach((b) => b.error(this.#label, ...args))
  }

  readonly extend = (label: string) => {
    return new Logger(this.#name, this.#behaviors, `${this.#label}[${label}]`)
  }

  readonly info = (...args: any[]) => {
    this.#behaviors.forEach((b) => b.info(this.#label, ...args))
  }

  readonly log = (...args: any[]) => {
    this.#behaviors.forEach((b) => b.log(this.#label, ...args))
  }

  readonly table = (table: TabularData) => {
    this.#behaviors.forEach((b) => b.table(this.#label, table))
  }

  readonly time = (name: string) => {
    this.#behaviors.forEach((b) => b.time(this.#label, name))
  }

  readonly timeEnd = (name: string) => {
    this.#behaviors.forEach((b) => b.timeEnd(this.#label, name))
  }

  readonly warn = (...args: any[]) => {
    this.#behaviors.forEach((b) => b.warn(this.#label, ...args))
  }
}
