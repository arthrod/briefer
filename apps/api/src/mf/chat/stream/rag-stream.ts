import { Response } from 'express'
import { Response as FetchResponse } from 'node-fetch'
import { ChatRecordStatus, UpdateTarget } from '../types/interfaces.js'
import { logger } from '../../../logger.js'
import { formatErrorMessage } from '../../../utils/format.js'
import { prisma } from '@briefer/database'
import { activeRequests } from '../utils/fetch.js'
import path from 'path'
import fs from 'fs/promises'
import { APIError } from '../types/errors.js'
import { sendSSEError } from '../utils/sse-utils.js'
import { ErrorCode } from '../../../constants/errorcode.js'

/**
 * Processes a streaming response from a fetch request, streaming SSE data to the client and updating the associated chat record or title in the database.
 *
 * This asynchronous function reads data chunks from the provided fetch response's body and decodes them using a TextDecoder.
 * It buffers incoming data, processes each line for SSE messages, and handles a special "[DONE]" marker to finalize the stream.
 * When "[DONE]" is detected, the function updates the chat record or chat title using transactions, writes the complete message to a log file,
 * and sends a "[DONE]" response to the client. The function also manages and logs errors, parses JSON content in each message, and supports
 * stream cancellation via an optional AbortController. In case of an aborted request or errors, it ensures that the current progress is saved.
 *
 * @param response - The fetch response object containing the streaming data. The body must be non-empty.
 * @param res - The Express response object used to send SSE messages back to the client.
 * @param updateTarget - An object with update parameters indicating whether to update a chat record or chat title, including properties such as `roundId` and `chatId`.
 * @param controller - (Optional) An AbortController used to cancel the stream processing if needed.
 *
 * @throws APIError - When the response body is empty.
 * @throws Error - Propagates errors encountered during stream processing or database updates.
 *
 * @returns A Promise that resolves when the streaming response has been fully processed or the operation has been aborted.
 */
export async function handleStreamResponse(
  response: FetchResponse,
  res: Response,
  updateTarget: UpdateTarget,
  controller?: AbortController
): Promise<void> {
  if (!response.body) {
    throw new APIError(
      'Response body is empty',
      ErrorCode.API_ERROR,
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
    const errorMessage = formatErrorMessage('rag', error)

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
