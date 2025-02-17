import { Response } from 'express'
import { ChatRecordStatus, UpdateTarget } from '../types/interfaces.js'
import { formatErrorMessage } from '../../../utils/format.js'
import { prisma } from '@briefer/database'
import { logger } from '../../../logger.js'


/**
 * Establishes and maintains a Server-Sent Events (SSE) connection.
 *
 * This function configures the provided Express response for an SSE connection by setting the necessary headers:
 * - `Content-Type` to `text/event-stream`
 * - `Cache-Control` to `no-cache`
 * - `Connection` to `keep-alive`
 *
 * It immediately flushes these headers and sets up a keep-alive mechanism that sends a comment (`: keepalive`)
 * to the client every 30 seconds to prevent the connection from timing out. Additionally, a cleanup routine is
 * registered to clear the keep-alive timer and end the response when the connection is closed.
 *
 * @param res - The Express Response object used for the SSE connection.
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
 * Sends a formatted error message via a Server-Sent Events (SSE) connection.
 *
 * This asynchronous function formats the provided error using the specified chat type and sends
 * the error message to the client over an SSE connection. If an update target is provided and its
 * type is "chat_record" with a valid ID, it attempts to save the error message to the database by
 * updating the chat record and the corresponding chat's update time. Any database errors are caught
 * and logged.
 *
 * @param res - The response object used for SSE communication.
 * @param error - The error to be formatted and sent.
 * @param updateTarget - Optional target information for updating the database. When present and of type
 * "chat_record", the function will persist the formatted error message.
 * @param chatType - Specifies the chat error type; either "rag" (default) or "report". This parameter
 * determines the formatting logic for the error message.
 *
 * @example
 * await sendSSEError(response, new Error('An unexpected error occurred'), {
 *   type: 'chat_record',
 *   id: 'record123',
 *   chatId: 'chat456'
 * });
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
