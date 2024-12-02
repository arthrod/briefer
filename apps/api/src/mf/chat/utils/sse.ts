import { Response } from 'express'
import { Response as FetchResponse } from 'node-fetch'
import { UpdateTarget } from '../types/interfaces'
import { logger } from '../../../logger.js'
import { CONFIG } from '../config/constants.js'
import { formatErrorMessage } from './format.js'
import { TimeoutError } from '../types/errors.js'
import { prisma } from '@briefer/database'
import { ChatRecordStatus } from '../services/chat.service.js'

// 设置SSE连接
export function setupSSEConnection(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // 设置保活定时器
  const keepAliveTimer = setInterval(() => {
    res.write(': keepalive\n\n')
  }, CONFIG.SSE.KEEP_ALIVE_INTERVAL)

  // 清理函数
  const cleanup = () => {
    clearInterval(keepAliveTimer)
    res.end()
  }

  // 监听连接关闭
  res.on('close', cleanup)
}

// 发送SSE错误
export async function sendSSEError(res: Response, error: unknown, updateTarget?: UpdateTarget) {
  const formattedError = formatErrorMessage(error)

  // 如果存在更新目标，将错误消息保存到数据库
  if (updateTarget?.type === 'chat_record' && updateTarget.roundId) {
    try {
      await prisma().$transaction([
        prisma().chatRecord.update({
          where: { id: updateTarget.roundId },
          data: {
            answer: Buffer.from(formattedError),
            speakerType: 'assistant',
            status: CONFIG.CHAT_STATUS.FAILED,
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
  // res.end() // 统一不关闭
}

// 发送SSE消息
export function sendSSEMessage(res: Response, data: any, type: string = 'message') {
  const message = {
    type,
    data
  }

  res.write(`data: ${JSON.stringify(message)}\n\n`)
}

// 处理流式响应
export async function handleStreamResponse(
  response: FetchResponse,
  res: Response,
  updateTarget: UpdateTarget,
  controller?: AbortController
): Promise<void> {
  if (!response.body) {
    throw new Error('No response body')
  }

  let retryCount = 0
  const maxRetries = CONFIG.SSE.MAX_RETRIES

  try {
    for await (const chunk of response.body) {
      const text = chunk.toString()
      const lines = text.split('\n').filter(Boolean)

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'error') {
              sendSSEError(res, parsed.data.message, updateTarget)
              return
            }
            sendSSEMessage(res, { ...parsed, updateTarget })
          } catch (e) {
            logger().error('Failed to parse SSE data:', { error: e, data })
            
            // 重试逻辑
            if (retryCount < maxRetries) {
              retryCount++
              logger().info(`Retrying SSE parse (${retryCount}/${maxRetries})`)
              continue
            }
            
            throw e
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger().info('Stream aborted by client')
      return
    }

    // 超时处理
    if (error instanceof TimeoutError) {
      sendSSEError(res, 'Stream timeout', updateTarget)
      return
    }

    throw error
  } finally {
    if (controller) {
      controller.abort()
    }
  }
}

// 创建SSE响应
export function createSSEResponse(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// 检查SSE支持
export function checkSSESupport(req: Request): boolean {
  return req.headers.get('accept') === 'text/event-stream'
}

// 发送SSE完成消息
export function sendSSEComplete(res: Response, updateTarget?: UpdateTarget) {
  const completeData = {
    type: 'complete',
    data: {
      message: 'Stream completed',
      ...(updateTarget && { updateTarget })
    }
  }

  res.write(`data: ${JSON.stringify(completeData)}\n\n`)
  res.end()
}

// SSE相关工具函数
export type SSEUpdateTarget = {
  type: 'chat_record' | 'chat'
  chatId: string
  roundId?: string
}

export const setupSSEConnectionUtil = (res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

export const sendSSEMessageUtil = (res: Response, data: any) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export const sendSSEErrorUtil = async (res: Response, error: Error, target: SSEUpdateTarget) => {
  logger().error({
    msg: 'SSE error',
    data: {
      error: error.message,
      target,
    },
  })

  if (target.type === 'chat_record' && target.roundId) {
    await prisma().chatRecord.update({
      where: {
        id: target.roundId,
      },
      data: {
        status: ChatRecordStatus.ERROR,
        updateTime: new Date(),
      },
    })
  }

  res.end()
}
