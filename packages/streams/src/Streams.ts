import { AbortError, defer } from '@johngw/async'
import { ForkableRecallStream } from '@johngw/stream/sinks/ForkableRecallStream'
import { ForkableReplayStream } from '@johngw/stream/sinks/ForkableReplayStream'
import { Controllable } from '@johngw/stream/sources/Controllable'
import { Subject } from '@johngw/stream/subjects/Subject'
import { StatefulSubject } from '@johngw/stream/subjects/StatefulSubject'
import {
  StateReducerInput,
  StateReducerOutput,
  StateReducers,
} from '@johngw/stream/transformers/stateReducer'
import { interpose } from '@johngw/stream/transformers/interpose'
import { ReadableStreamReadResult } from 'node:stream/web'
import { O } from 'ts-toolbelt'

export type StreamDict = {
  subjects: Record<string, unknown>
  recallSubjects: Record<string, unknown>
  replaySubjects: Record<string, unknown>
  statefulSubjects: Record<
    string,
    { actions: Record<string, unknown>; state: unknown }
  >
}

export type CreateStreamDict<D extends Partial<StreamDict>> = O.Merge<
  D,
  {
    subjects: {}
    recallSubjects: {}
    replaySubjects: {}
    statefulSubjects: {}
  }
>

export class Streams<Dict extends StreamDict = CreateStreamDict<{}>> {
  readonly #subjects: Partial<
    Record<keyof Dict['subjects'], Subject<unknown>>
  > = {}

  readonly #recallSubjects: Partial<
    Record<keyof Dict['recallSubjects'], Subject<unknown>>
  > = {}

  readonly #replaySubjects: Partial<
    Record<keyof Dict['replaySubjects'], Subject<unknown>>
  > = {}

  readonly #statefulSubjects: Partial<
    Record<
      keyof Dict['statefulSubjects'],
      StatefulSubject<StateReducers<any, any>, any>
    >
  > = {}

  readonly #untilStart: Promise<void>

  readonly start: () => void

  constructor() {
    const deffered = defer()
    this.#untilStart = deffered.promise
    this.start = deffered.resolve
  }

  fork<Name extends keyof Dict['subjects']>(name: Name) {
    return this.subject(name).fork()
  }

  forkRecall<Name extends keyof Dict['recallSubjects']>(name: Name) {
    return this.recallSubject(name).fork()
  }

  forkReplay<Name extends keyof Dict['replaySubjects']>(name: Name) {
    return this.replaySubject(name).fork()
  }

  forkState<Name extends keyof Dict['statefulSubjects']>(
    name: Name,
    signal?: AbortSignal,
  ) {
    type O = StateReducerOutput<
      Dict['statefulSubjects'][Name]['actions'],
      Dict['statefulSubjects'][Name]['state']
    >

    let reader: ReadableStreamDefaultReader<O>

    return new ReadableStream<O>({
      start: async () => {
        await this.whenStarted(signal)
        reader = this.statefulSubject(name).fork().getReader()
      },

      cancel: (reason) => reader.cancel(reason),

      pull: async (controller) => {
        let result: ReadableStreamReadResult<O>
        try {
          result = await reader.read()
        } catch (error) {
          return controller.error(error)
        }
        if (result.done) return controller.close()
        else controller.enqueue(result.value)
      },
    })
  }

  control<Name extends keyof Dict['subjects']>(
    name: Name,
    signal?: AbortSignal,
  ): Controllable<Dict['subjects'][Name]> {
    return this.subject(name, signal).control()
  }

  controlRecall<Name extends keyof Dict['recallSubjects']>(
    name: Name,
  ): Controllable<Dict['recallSubjects'][Name]> {
    return this.recallSubject(name).control()
  }

  controlReplay<Name extends keyof Dict['replaySubjects']>(
    name: Name,
  ): Controllable<Dict['replaySubjects'][Name]> {
    return this.replaySubject(name).control()
  }

  controlState<Name extends keyof Dict['statefulSubjects']>(
    name: Name,
    reducers?: StateReducers<
      Dict['statefulSubjects'][Name]['actions'],
      Dict['statefulSubjects'][Name]['state']
    >,
  ) {
    return (
      reducers
        ? this.setStatefulSubject(name, reducers)
        : this.statefulSubject(name)
    ).control()
  }

  write<Name extends keyof Dict['subjects']>(
    name: Name,
    {
      queuingStrategy,
      signal,
    }: {
      queuingStrategy?: QueuingStrategy
      signal?: AbortSignal
    } = {},
  ): WritableStream<Dict['subjects'][Name]> {
    return this.subject(name, signal).write(queuingStrategy)
  }

  writeRecall<Name extends keyof Dict['recallSubjects']>(
    name: Name,
    queuingStrategy: QueuingStrategy,
  ): WritableStream<Dict['recallSubjects'][Name]> {
    return this.recallSubject(name).write(queuingStrategy)
  }

  writeReplay<Name extends keyof Dict['replaySubjects']>(
    name: Name,
    queuingStrategy?: QueuingStrategy,
  ): WritableStream<Dict['replaySubjects'][Name]> {
    return this.replaySubject(name).write(queuingStrategy)
  }

  writeState<Name extends keyof Dict['statefulSubjects']>(
    name: Name,
    queuingStrategy?: QueuingStrategy,
  ): WritableStream<
    StateReducerInput<Dict['statefulSubjects'][Name]['actions']>
  > {
    return this.statefulSubject(name).write(queuingStrategy)
  }

  whenStarted(signal?: AbortSignal): Promise<void> {
    return signal
      ? new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(new AbortError())
          signal.addEventListener('abort', () => reject(new AbortError()))
          this.#untilStart.then(resolve)
        })
      : this.#untilStart
  }

  subject<Name extends keyof Dict['subjects']>(
    name: Name,
    signal?: AbortSignal,
  ): Subject<Dict['subjects'][Name]> {
    if (!this.#subjects[name])
      this.#subjects[name] = new Subject({
        pre: [interpose(this.whenStarted(signal))],
      })
    return this.#subjects[name] as Subject<Dict['subjects'][Name]>
  }

  recallSubject<Name extends keyof Dict['recallSubjects']>(
    name: Name,
  ): Subject<Dict['recallSubjects'][Name]> {
    if (!this.#recallSubjects[name])
      this.#recallSubjects[name] = new Subject({
        forkable: new ForkableRecallStream(),
      })
    return this.#recallSubjects[name] as Subject<Dict['recallSubjects'][Name]>
  }

  replaySubject<Name extends keyof Dict['replaySubjects']>(
    name: Name,
  ): Subject<Dict['replaySubjects'][Name]> {
    if (!this.#replaySubjects[name])
      this.#replaySubjects[name] = new Subject({
        forkable: new ForkableReplayStream(),
      })
    return this.#replaySubjects[name] as Subject<Dict['replaySubjects'][Name]>
  }

  statefulSubject<Name extends keyof Dict['statefulSubjects']>(
    name: Name,
  ): StatefulSubject<
    Dict['statefulSubjects'][Name]['actions'],
    Dict['statefulSubjects'][Name]['state']
  > {
    if (!this.#statefulSubjects[name])
      throw new Error(
        `No registered stateful subject "${String(
          name,
        )}". It must be created with streams.controlState(name, reducers)`,
      )
    return this.#statefulSubjects[name] as StatefulSubject<
      Dict['statefulSubjects'][Name]['actions'],
      Dict['statefulSubjects'][Name]['state']
    >
  }

  setStatefulSubject<Name extends keyof Dict['statefulSubjects']>(
    name: Name,
    reducers: StateReducers<
      Dict['statefulSubjects'][Name]['actions'],
      Dict['statefulSubjects'][Name]['state']
    >,
  ): StatefulSubject<
    Dict['statefulSubjects'][Name]['actions'],
    Dict['statefulSubjects'][Name]['state']
  > {
    if (this.#statefulSubjects[name])
      throw new Error(`Cannot override the stateful subject "${String(name)}"`)
    this.#statefulSubjects[name] = new StatefulSubject(reducers)
    return this.#statefulSubjects[name]!
  }
}
