import { Response } from 'express'
import { ChatRecordStatus, UpdateTarget } from '../types/interfaces.js'
import { formatErrorMessage, ERROR_MESSAGES } from '../../../utils/format.js'
import { prisma } from '@briefer/database'
import { logger } from '../../../logger.js'


// 设置SSE连接
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

// 发送SSE错误
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
