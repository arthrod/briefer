import { Response } from 'express'
import { Response as FetchResponse } from 'node-fetch'
import { ChatRecordStatus, UpdateTarget } from '../types/interfaces.js'
import { logger } from '../../../logger.js'
import { CONFIG } from '../config/constants.js'
import { formatErrorMessage } from './format.js'
import { prisma } from '@briefer/database'
import { activeRequests } from './fetch.js'
import path from 'path'
import fs from 'fs/promises'
import { APIError, ERROR_CODES } from '../types/errors.js' // Import APIError

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
    throw new APIError(
      'Response body is empty',
      ERROR_CODES.API_ERROR,
      500
    )
  }

  if (controller) {
    // 存储控制器
    activeRequests.set(updateTarget.roundId!, controller)
  }

  const stream = response.body
  const textDecoder = new TextDecoder()
  let buffer = ''
  let completeMessage = ''

  // 生成唯一的文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logFileName = `sse-message-${timestamp}.log`
  const logFilePath = path.join(process.cwd(), 'logs', logFileName)

  try {
    await fs.mkdir(path.join(process.cwd(), 'logs'), { recursive: true })

    // 更新状态为聊天中
    if (updateTarget.type === 'chat_record' && updateTarget.roundId) {
      await prisma().chatRecord.update({
        where: { id: updateTarget.roundId },
        data: { status: ChatRecordStatus.PROCESSING }, // 聊天中状态
      })

      logger().info({
        msg: 'Chat status updated to CHATTING',
        data: { roundId: updateTarget.roundId, status: ChatRecordStatus.PROCESSING },
      })
    }

    for await (const chunk of stream) {
      // 添加中断检查
      if (controller?.signal.aborted) {
        logger().info({
          msg: 'Stream processing aborted',
          data: { roundId: updateTarget.roundId },
        })
        break
      }

      buffer += textDecoder.decode(chunk as Buffer, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        if (trimmedLine.startsWith('data:')) {
          const data = trimmedLine.slice(5).trim()

          // 打印每条 SSE 数据
          logger().info({
            msg: 'SSE data received',
            data: {
              rawData: data,
              updateTarget,
              timestamp: new Date().toISOString(),
            },
          })

          if (data.includes('[DONE]')) {
            // 在完整消息末尾添加[DONE]标记
            // completeMessage += '\n[DONE]'

            try {
              const now = new Date()

              if (updateTarget.type === 'chat_record' && updateTarget.roundId) {
                await prisma().$transaction([
                  // 更新 ChatRecord
                  prisma().chatRecord.update({
                    where: { id: updateTarget.roundId },
                    data: {
                      answer: Buffer.from(completeMessage),
                      speakerType: 'assistant',
                      status: ChatRecordStatus.COMPLETED,
                      updateTime: now,
                    },
                  }),
                  // 同时更新对应的 Chat
                  prisma().chat.update({
                    where: {
                      id: updateTarget.chatId, // 确保 chatId 也传入了
                    },
                    data: {
                      updateTime: now,
                    },
                  }),
                ])

                logger().info({
                  msg: 'Chat record and chat updated successfully',
                  data: {
                    roundId: updateTarget.roundId,
                    chatId: updateTarget.chatId,
                    messageLength: completeMessage.length,
                    updateTime: now,
                  },
                })
              } else if (updateTarget.type === 'chat_title' && updateTarget.chatId) {
                await prisma().chat.update({
                  where: { id: updateTarget.chatId },
                  data: {
                    title: completeMessage.trim(),
                    updateTime: now,
                  },
                })

                logger().info({
                  msg: 'Chat title updated successfully',
                  data: {
                    chatId: updateTarget.chatId,
                    newTitle: completeMessage.trim(),
                    updateTime: now,
                  },
                })
              }
            } catch (dbError) {
              logger().error({
                msg: 'Failed to update database',
                data: {
                  updateTarget,
                  error: dbError instanceof Error ? dbError.message : 'Unknown error',
                },
              })
              // 使用sendSSEError处理数据库错误
              await sendSSEError(res, dbError, updateTarget)
              return
            }

            await fs.writeFile(logFilePath, completeMessage, 'utf-8')

            res.write(`data: [DONE]\n\n`)
            return
          }

          try {
            // 解析JSON获取实际内容
            const jsonData = JSON.parse(data)
            const content = jsonData.choices?.[0]?.delta?.content || ''

            if (content && typeof content === 'string' && content.trim().length > 0) {
              completeMessage += content

              // 打印每个内容片段
              logger().info({
                msg: 'SSE content chunk',
                data: {
                  content,
                  currentLength: completeMessage.length,
                  updateTarget,
                  timestamp: new Date().toISOString(),
                },
              })

              // 添加中断检查
              if (!controller?.signal.aborted) {
                res.write(`data: ${content.replace(/\n/g, '')}\n\n`)
              }
            }
          } catch (jsonError) {
            logger().error({
              msg: 'Failed to parse SSE data',
              data: {
                rawData: data,
                error: jsonError instanceof Error ? jsonError.message : 'Unknown error',
              },
            })

            // 使用sendSSEError处理JSON解析错误
            if (updateTarget.type === 'chat_record' && updateTarget.roundId) {
              await sendSSEError(res, new Error('解析响应数据失败，请重试'), updateTarget)
              return
            }
          }
        }
      }
    }

    // 处理最后的缓冲区
    if (buffer.trim()) {
      // 打印最后的缓冲区内容
      logger().info({
        msg: 'Processing final buffer',
        data: {
          buffer: buffer.trim(),
          updateTarget,
          timestamp: new Date().toISOString(),
        },
      })

      const data = buffer.trim()
      if (data.startsWith('data:')) {
        try {
          const jsonData = JSON.parse(data.slice(5).trim())
          const content = jsonData.choices?.[0]?.delta?.content || ''
          if (content && typeof content === 'string' && content.trim().length > 0) {
            completeMessage += content
            // 添加中断检查
            if (!controller?.signal.aborted) {
              res.write(`data: ${content.replace(/\n/g, '')}\n\n`) // 发送时去除换行符
            }
          }
        } catch (parseError) {
          logger().error({
            msg: 'Failed to parse final buffer JSON data',
            data: {
              rawData: data,
              error: parseError instanceof Error ? parseError.message : 'Unknown error',
            },
          })
        }
      }
    }

    // 如果是因为中断而结束的，确保保存当前进度并结束响应
    if (controller?.signal.aborted) {
      const now = new Date()
      if (updateTarget.type === 'chat_record' && updateTarget.roundId) {
        // 确保消息末尾有 [DONE] 标识
        // const finalMessage = completeMessage.includes('[DONE]')
        //   ? completeMessage
        //   : completeMessage.trim() + '\n[DONE]'

        await prisma().$transaction([
          prisma().chatRecord.update({
            where: { id: updateTarget.roundId },
            data: {
              answer: Buffer.from(completeMessage), // 使用添加了 [DONE] 的消息
              speakerType: 'assistant',
              status: ChatRecordStatus.COMPLETED,
              updateTime: now,
            },
          }),
          prisma().chat.update({
            where: { id: updateTarget.chatId },
            data: { updateTime: now },
          }),
        ])
      }

      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n')
        res.end()
      }
      return
    }

    // 打印完整的消息内容
    logger().info({
      msg: 'Complete SSE message',
      data: {
        completeMessage,
        messageLength: completeMessage.length,
        updateTarget,
        timestamp: new Date().toISOString(),
      },
    })

    await fs.writeFile(logFilePath, completeMessage, 'utf-8')
  } catch (error) {
    logger().error({
      msg: 'SSE stream error',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        updateTarget,
        filePath: logFilePath,
      },
    })

    // 格式化错误消息
    const errorMessage = formatErrorMessage(error)

    // 组合已接收的消息和错误信息
    const finalMessage = [
      completeMessage.trim(), // 已接收的消息
      '', // 空行分隔
      errorMessage, // 错误信息
    ].join('\n')

    try {
      const now = new Date()

      if (updateTarget.type === 'chat_record' && updateTarget.roundId) {
        await prisma().$transaction([
          prisma().chatRecord.update({
            where: { id: updateTarget.roundId },
            data: {
              answer: Buffer.from(finalMessage),
              speakerType: 'assistant',
              status: ChatRecordStatus.COMPLETED,
              updateTime: now,
            },
          }),
          prisma().chat.update({
            where: {
              id: updateTarget.chatId,
            },
            data: {
              updateTime: now,
            },
          }),
        ])
      }
    } catch (dbError) {
      logger().error({
        msg: 'Failed to update database after error',
        data: {
          updateTarget,
          error: dbError instanceof Error ? dbError.message : 'Unknown error',
        },
      })
      // 使用sendSSEError处理数据库错误
      await sendSSEError(res, dbError, updateTarget)
      return
    }

    throw error // 继续抛出错误以触发外层错误处理
  } finally {
    // 清理控制器
    if (updateTarget.roundId) {
      activeRequests.delete(updateTarget.roundId)
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
