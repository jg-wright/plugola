import type {
  IncomingMessage,
  Server,
  ServerResponse,
  RequestListener,
} from 'node:http'
import type { Frame } from './Channel.ts'
import { HTTPSenderChannel } from './HTTPSenderChannel.ts'

export class HTTPSenderReceiverChannel<
  Request extends typeof IncomingMessage = typeof IncomingMessage,
  Response extends typeof ServerResponse<InstanceType<Request>> =
    typeof ServerResponse,
> extends HTTPSenderChannel {
  constructor(
    private readonly server: Server<Request, Response>,
    ...senderArgs: ConstructorParameters<typeof HTTPSenderChannel>
  ) {
    super(...senderArgs)
  }

  override receive(handler: (frame: Frame) => void): () => void {
    const listener: RequestListener<Request, Response> = (req, res) => {
      const body: any[] = []
      req.on('data', (chunk) => body.push(chunk))
      req.on('end', () => {
        const bodyString = Buffer.concat(body).toString()
        let frame: Frame
        try {
          frame = JSON.parse(bodyString)
        } catch (error) {
          res.writeHead(500)
          res.end(JSON.stringify(error))
          return
        }
        res.writeHead(200)
        res.end('ok')
        handler(frame)
      })
    }

    this.server.addListener('request', listener)

    return () => {
      this.server.removeListener('request', listener)
    }
  }
}
