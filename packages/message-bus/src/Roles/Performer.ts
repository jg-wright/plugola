import { MessageFactory } from '../Message/Message.ts'
import { Interceptor } from './Interceptor.ts'
import { Responder } from './Responder.ts'
import { Subscriber } from './Subscriber.ts'

export type Performer<M extends MessageFactory = MessageFactory> =
  | Interceptor<M>
  | Responder<M>
  | Subscriber<M>
