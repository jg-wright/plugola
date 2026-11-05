# @plugola/logger

A labelled logger whose output is decided by one or more **behaviours**.

```typescript
import Logger from '@plugola/logger/Logger'
import ConsoleLoggerBehavior from '@plugola/logger/ConsoleLoggerBehavior'
import DisabledLoggerBehavior from '@plugola/logger/DisabledLoggerBehavior'

const log = new Logger(
  'ads',
  debug ? new ConsoleLoggerBehavior() : new DisabledLoggerBehavior(),
)

log.info('loaded') // [ads] loaded
log.extend('slots').warn('no slots') // [ads][slots] no slots
```

`DisabledLoggerBehavior` drops everything except `error`. Implement
`LoggerBehavior` (from `@plugola/logger/LoggerBehavior`) to send logs
elsewhere; `FileLoggerBehavior` writes to a file in Node.
