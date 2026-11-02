# @plugola/queue

Small runnable queues that buffer work while stopped and drain it in FIFO order
once started.

- **`Queue<T>`** — buffers pushed items while stopped; on `start()` it drains
  them through its `exec` callback and thereafter executes pushes immediately.
- **`DiscriminatedQueue`** — a `Queue` that routes each item to an executor
  keyed by its `type` discriminant, with `addExec` to register more.
- **`MethodQueue`** — wraps arbitrary methods so their calls are queued and
  resolve via a `Promise` when the queue runs.
- **`Runnable`** — the `start()` / `stop()` / `running` interface the queues
  implement.

```ts
import { Queue } from '@plugola/queue'

const seen: number[] = []
const queue = new Queue<number>((n) => seen.push(n))
queue.push(1)
queue.push(2)
queue.start() // seen === [1, 2]
```
