import { Response } from 'express'
import { ChatRecordStatus, UpdateTarget } from '../types/interfaces.js'
import { formatErrorMessage } from '../../../utils/format.js'
import { prisma } from '@briefer/database'
import { logger } from '../../../logger.js'


/**
 * Establishes a Server-Sent Events (SSE) connection by configuring essential HTTP headers and initializing a keep-alive mechanism.
 *
 * This function sets the 'Content-Type' header to 'text/event-stream', disables caching via the 'Cache-Control' header,
 * and maintains a persistent connection with the 'Connection' header set to 'keep-alive'. It flushes headers immediately to
 * start the SSE stream and sets up a keep-alive timer that sends a heartbeat comment every 30 seconds to prevent connection timeout.
 *
 * A cleanup function is registered on the response's 'close' event to clear the keep-alive timer and properly terminate the connection.
 *
 * @param res - Express response object used to manage the SSE connection.
 */
export function setupSSEConnection(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // 设置保活定时器
    const keepAliveTimer = setInterval(() => {
        res.write(': keepalive\n\n')
    }, 30000) // 30秒发送一次保活信号

    // 清理函数
    const cleanup = () => {
        clearInterval(keepAliveTimer)
        res.end()
    }

    // 监听连接关闭
    res.on('close', cleanup)
}

/**
 * Sends an error message over a Server-Sent Events (SSE) connection.
 *
 * This asynchronous function formats the provided error message based on the specified chat type and sends it
 * to the client via an SSE stream. If an update target of type 'chat_record' is provided and includes a valid ID,
 * the function will also attempt to save the error message to the database within a transaction.
 *
 * @param res - The Express response object used to stream SSE data to the client.
 * @param error - The error object or message to be formatted and transmitted.
 * @param updateTarget - (Optional) An object specifying the target for updating the chat record in the database.
 * @param chatType - (Optional) The type of chat error to format ('rag' or 'report'); defaults to 'rag'.
 *
 * @remarks
 * The function splits the formatted error message into individual lines and sends each as a separate SSE event.
 * After sending all lines, it writes a terminating '[DONE]' message to signal the end of the error transmission.
 * If an error occurs during the database operation, it logs the failure without interrupting the SSE flow.
 */
export async function sendSSEError(
    res: Response,
    error: unknown,
    updateTarget?: UpdateTarget,
    chatType: 'rag' | 'report' = 'rag' // 默认为 rag 类型
) {
    const formattedError = formatErrorMessage(chatType, error)

    // 如果存在更新目标，将错误消息保存到数据库
    if (updateTarget?.type === 'chat_record' && updateTarget.id) {
        try {
            await prisma().$transaction([
                prisma().chatRecord.update({
                    where: { id: updateTarget.id },
                    data: {
                        answer: Buffer.from(formattedError),
                        speakerType: 'assistant',
                        status: ChatRecordStatus.ERROR,
                        updateTime: new Date(),
                    },
                }),
                prisma().chat.update({
                    where: { id: updateTarget.chatId },
                    data: { updateTime: new Date() },
                }),
            ])
        } catch (dbError) {
            logger().error({
                msg: 'Failed to save error message to database',
                data: { error: dbError },
            })
        }
    }

    // 分行发送错误消息，确保格式正确
    formattedError.split('\n').forEach((line) => {
        res.write(`data: ${line}\n`)
    })
    res.write('\n') // 表示该消息结束
    res.write('data: [DONE]\n\n')

}
