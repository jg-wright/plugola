export interface Runnable {
  resume(): void
  pause(): void
  running: boolean
}
