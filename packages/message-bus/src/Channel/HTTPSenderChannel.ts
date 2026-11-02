import type { Channel, Frame } from './Channel.ts'

export class HTTPSenderChannel implements Channel {
  constructor(
    protected readonly requestFor: (frame: Frame) => Request,
    protected readonly requestError: (error: unknown) => void,
  ) {}

  send(frame: Frame) {
    let request: Request
    try {
      request = this.requestFor(frame)
    } catch (error) {
      return this.requestError(error)
    }
    fetch(request)
      .then((response) => {
        if (!response.ok) throw new HTTPSenderChannelResponseError(response)
      })
      .catch(this.requestError)
  }

  receive(_handler: (frame: Frame) => void): () => void {
    return () => {}
  }
}

export class HTTPSenderChannelResponseError extends Error {
  constructor(public readonly response: Response) {
    super(`Received ${response.status} when requesting to HTTPSenderChannel`)
  }
}
