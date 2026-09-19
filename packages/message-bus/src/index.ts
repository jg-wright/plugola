export { MessageBus } from './MessageBus.ts'
export { MessageGateway } from './Participant/MessageGateway.ts'

// Defining messages
export * from './Message/Message.ts'
export * from './Message/CommandMessage.ts'
export * from './Message/Serializable.ts'
export * from './Message/Codec.ts'

// Handler roles and subscription filtering
export * from './Roles/Subscriber.ts'
export * from './Roles/Responder.ts'
export * from './Roles/Interceptor.ts'
export * from './Filter.ts'

// Transports: bridging one bus to another over a channel
export * from './Channel/MessageRegistry.ts'
export * from './Channel/Channel.ts'
export { LoopbackChannel } from './Channel/LoopbackChannel.ts'
export { PortChannel, type PortLike } from './Channel/PortChannel.ts'
export * from './Bridge/MessagingBridge.ts'
