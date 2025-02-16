import pino from 'pino'
import { IPubSub, messageYProtocolSchema } from './index.js'
import prisma, { publish, subscribe } from '@briefer/database'
import { z } from 'zod'
import { jsonString, uuidSchema } from '@briefer/types'
import { logger } from '../../../logger.js'

const PGMessage = messageYProtocolSchema.omit({ data: true }).extend({
  channel: z.string(),
  payloadId: uuidSchema,
})
type PGMessage = z.infer<typeof PGMessage>

export class PGPubSub implements IPubSub {
  constructor(
    private readonly channel: string,
    private readonly logger: pino.Logger
  ) {}

  public async publish(message: z.infer<typeof messageYProtocolSchema>): Promise<void> {
    const payload = await prisma().pubSubPayload.create({
      data: {
        payload: Buffer.from(message.data),
      },
      select: { id: true },
    })

    const pgMessage: PGMessage = {
      id: message.id,
      channel: this.channel,
      senderId: message.senderId,
      targetId: message.targetId,
      clock: message.clock,
      payloadId: payload.id,
    }
    await publish(this.pgChannel(), JSON.stringify(pgMessage))
  }

  public async subscribe(
    callback: (message: z.infer<typeof messageYProtocolSchema>) => void
  ): Promise<() => Promise<void>> {
    this.logger.trace(
      {
        channel: this.channel,
        pgChannel: this.pgChannel(),
      },
      'Subscribing to channel'
    )
    const cleanup = await subscribe(this.pgChannel(), async (message) => {
      if (!message) {
        this.logger.error(
          {
            channel: this.channel,
            pgChannel: this.pgChannel(),
          },
          'Received empty message'
        )
        return
      }

      const parsed = jsonString.pipe(PGMessage).safeParse(message)
      if (!parsed.success) {
        this.logger.error(
          {
            channel: this.channel,
            pgChannel: this.pgChannel(),
            message,
            err: parsed.error,
          },
          'Failed to parse message'
        )
        return
      }

      // since pg channel has a max length, we can't be sure that we wont have collisions
      if (parsed.data.channel !== this.channel) {
        return
      }

      const dbData = await prisma().pubSubPayload.findUnique({
        where: {
          id: parsed.data.payloadId,
        },
      })
      if (!dbData) {
        this.logger.error(
          {
            channel: this.channel,
            pgChannel: this.pgChannel(),
            payloadId: parsed.data.payloadId,
          },
          'Could not find pubsub payload in database'
        )
        return
      }

      const yjsMessage: z.infer<typeof messageYProtocolSchema> = {
        id: parsed.data.id,
        data: new Uint8Array(dbData.payload.buffer.slice(0)),
        senderId: parsed.data.senderId,
        targetId: parsed.data.targetId,
        clock: parsed.data.clock,
      }
      callback(yjsMessage)
    })
    this.logger.trace(
      {
        channel: this.channel,
        pgChannel: this.pgChannel(),
      },
      'Subscribed to channel'
    )
    return cleanup
  }

  private pgChannel(): string {
    // max postgres channel length is 63
    return this.channel.slice(0, 63)
  }
}

const PUB_SUB_PAYLOAD_TTL = 1000 * 60 * 60 * 24 // 24 hours
const PUB_SUB_PAYLOAD_CLEANUP_INTERVAL = 1000 * 60 // 1 minute

export async function startPubSubPayloadCleanup() {
  let timeout: NodeJS.Timeout | null = null
  let currentCleanup = Promise.resolve()

  const cleanup = async () => {
    try {
      logger().trace('Cleaning up pubsub payloads')
      let deletedCount = 0
      const lte = new Date(Date.now() - PUB_SUB_PAYLOAD_TTL)
      while (true) {
        const oldPayloads = await prisma().pubSubPayload.findMany({
          where: {
            createdAt: {
              lte,
            },
          },
          select: { id: true },
          take: 1000,
        })
        const { count } = await prisma().pubSubPayload.deleteMany({
          where: {
            id: {
              in: oldPayloads.map((p) => p.id),
            },
          },
        })
        deletedCount += count
        if (count === 0) {
          break
        }
      }
      logger().trace({ count: deletedCount }, 'Cleaned up pubsub payloads')
    } catch (err) {
      logger().error({ err }, 'Failed to clean up pubsub payloads')
    }

    timeout = setTimeout(() => {
      currentCleanup = cleanup()
    }, PUB_SUB_PAYLOAD_CLEANUP_INTERVAL)
  }

  currentCleanup = cleanup()

  return async () => {
    logger().info('[shutdown] Stopping pubsub payload cleanup')
    if (timeout) {
      clearTimeout(timeout)
    }
    await currentCleanup
    logger().info('[shutdown] Stopped pubsub payload cleanup')
  }
}
