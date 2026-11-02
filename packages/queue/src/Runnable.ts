export interface Runnable {
  resume(): void
  pause(): void
  get running(): boolean
}
