import { Response } from 'express'
import { ChatRecordStatus, UpdateTarget } from '../types/interfaces.js'
import { formatErrorMessage } from '../../../utils/format.js'
import { prisma } from '@briefer/database'
import { logger } from '../../../logger.js'


/**
 * Initializes a Server-Sent Events (SSE) connection.
 *
 * This function configures the provided HTTP response to support SSE by setting the required headers,
 * flushing the headers immediately, and establishing a keep-alive mechanism that sends a
 * ": keepalive" message every 30 seconds to maintain the persistent connection.
 *
 * Additionally, a cleanup handler is registered on the response's "close" event to clear
 * the keep-alive timer and properly close the connection.
 *
 * @param res - The HTTP response object from Express.
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
 * Sends an error message over a Server-Sent Events (SSE) connection and optionally records the error in the database.
 *
 * This asynchronous function formats the provided error according to the specified chat type and sends it to the client via the SSE response.
 * If an update target of type "chat_record" is provided with a valid ID, it attempts to update the corresponding chat record and associated chat's update time
 * within a database transaction. In case the database operation fails, the error is logged. The formatted error message is sent line by line using the SSE protocol,
 * followed by a "[DONE]" message to signal the end of transmission.
 *
 * @param res - The SSE response object used to communicate with the client.
 * @param error - The error object or message to be formatted and transmitted.
 * @param updateTarget - (Optional) The target object indicating where the error message should be archived; if its type is "chat_record" and it contains a valid ID,
 *                     the error will be saved to the database.
 * @param chatType - The type of chat context for error formatting, either "rag" (default) or "report".
 *
 * @example
 * sendSSEError(response, new Error("An unexpected error occurred"), { type: "chat_record", id: "recordId", chatId: "chatId" });
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
