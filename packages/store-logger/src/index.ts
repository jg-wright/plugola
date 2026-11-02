import type { Store } from '@plugola/store'
import type Logger from '@plugola/logger/Logger'

export default function storeLogger(
  store: Store<any, any>,
  logger: Logger,
  label = 'store',
) {
  const storeLogger = logger.extend(label)

  const unsubscribe = store.subscribe((state, ...args) => {
    storeLogger.info(...args, state)
  })

  const staleUnsubscribe = store.subscribeToStaleEvents((_state, ...args) => {
    storeLogger.info(...args, 'NO_CHANGE')
  })

  return () => {
    unsubscribe()
    staleUnsubscribe()
  }
}
