import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma, createDocument } from '@briefer/database'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../logger.js'
import { authenticationMiddleware } from '../../auth/token.js'
import { UserWorkspaceRole } from '@prisma/client'
import rateLimit from 'express-rate-limit'
import cache from 'memory-cache'
import fetch, { Response as FetchResponse } from 'node-fetch'
import { Send } from 'express-serve-static-core'
import fs from 'fs/promises'
import path from 'path'
import { titleUpdateEmitter } from './title-summarizer.js'
import { handleReportStreamResponse } from './report-stream.js'
import { IOServer } from '../../websocket/index.js'

// 1. 将所有配置常量集中到一个对象中
const CONFIG = {
  USE_TEST_AUTH: false, // 测试模式开关，如果为 true，则使用 mock 数据
  AI_AGENT_URL: process.env['AI_AGENT_URL'],
  AI_AGENT_TIMEOUT: Number(process.env['AI_AGENT_TIMEOUT']) ?? 15000, // AI Agent 超时时间， 默认15s
  CHAT_DETAIL_CACHE_DURATION: 60,
  // RATE_LIMITS: {
  //   API: {
  //     windowMs: 15 * 60 * 1000,
  //     max: 100
  //   },
  //   CREATE_CHAT: {
  //     windowMs: 60 * 1000,
  //     max: 20
  //   },
  //   COMPLETIONS: {
  //     windowMs: 60 * 1000,
  //     max: 10
  //   },
  //   SUMMARIZE: {
  //     windowMs: 60 * 1000,
  //     max: 10
  //   }
  // },
  CHAT_STATUS: {
    START: 1,
    CHATTING: 2,
    COMPLETED: 3,
    FAILED: 4,
  },
  AI_AGENT_ENDPOINTS: {
    REPORT_COMPLETIONS: '/v1/ai/chat/report/completions',
    DATA_COMPLETIONS: '/v1/ai/chat/data/completions',
    RELATION_CHECK: '/v1/ai/chat/relation',
    SUMMARIZE: '/v1/ai/chat/summarize',
  },
} as const

// 2. 速率限制器配置
// const apiLimiter = rateLimit({
//   windowMs: CONFIG.RATE_LIMITS.API.windowMs,
//   max: CONFIG.RATE_LIMITS.API.max
// })
//
// const createChatLimiter = rateLimit({
//   windowMs: CONFIG.RATE_LIMITS.CREATE_CHAT.windowMs,
//   max: CONFIG.RATE_LIMITS.CREATE_CHAT.max
// })
//
// const completionsLimiter = rateLimit({
//   windowMs: CONFIG.RATE_LIMITS.COMPLETIONS.windowMs,
//   max: CONFIG.RATE_LIMITS.COMPLETIONS.max
// })
//
// const summarizeLimiter = rateLimit({
//   windowMs: CONFIG.RATE_LIMITS.SUMMARIZE.windowMs,
//   max: CONFIG.RATE_LIMITS.SUMMARIZE.max
// })

// 3. 接口定义
interface FileInfo {
  id: string
  name: string
  type: string
}

interface ChatDetailResponse {
  type: 'rag' | 'report'
  messages: {
    id: string
    role: string
    content: string
  }[]
  documentId: string | null
  file: FileInfo | null
}

interface CachedResponse {
  code: number
  data: unknown
  msg: string
}

interface ExtendedResponse extends Response {
  sendResponse: Send<any, Response>
}

interface Message {
  id: string
  role: string
  content: string
}

interface RelationCheckResponse {
  code: number
  msg: string
  data: {
    related: boolean
  }
}

interface ErrorResponse {
  code: number
  msg: string
  data: null
}

// 4. Schema 定义

// 基础类型定义
const baseId = z.string().min(1, 'ID不能为空')

// 基础 Schema
const baseChatSchema = {
  chatId: baseId.describe('对话ID'),
}

const baseRoundSchema = {
  ...baseChatSchema,
  roundId: baseId.describe('对话轮次ID'),
}

// 具体业务 Schema
const createChatSchema = z.object({
  type: z.enum(['rag', 'report']),
  fileId: z.string(),
})

const updateChatSchema = z.object({
  id: baseId.describe('对话ID'),
  title: z.string().min(1, '标题不能为空'),
})

const deleteChatSchema = z.object({
  id: baseId.describe('对话ID'),
})

const createChatRoundSchema = z.object({
  question: z.string().min(1, '问题不能为空'),
  ...baseChatSchema,
})

const getChatDetailSchema = z.object({
  id: baseId.describe('对话ID'),
})

const chatCompletionsSchema = z.object(baseRoundSchema)
const summarizeChatSchema = z.object(baseRoundSchema)
const getChatStatusSchema = z.object(baseChatSchema)

// 在 Schema 定义部分添加
const stopChatSchema = z.object({
  roundId: baseId.describe('对话轮次ID'),
})

// 5. 错误类
class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

class AuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

// 6. 工具函数
const sanitizeInput = (input: string): string => {
  if (!input) return ''
  input = input.replace(/<[^>]*>/g, '')
  input = input.replace(/[<>'"]/g, '')
  input = input.replace(/[\x00-\x1F\x7F]/g, '')
  return input.trim()
}

const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const validateEnvVars = () => {
  const requiredEnvVars = ['AI_AGENT_URL']
  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
}

const createErrorResponse = (code: number, message: string): ErrorResponse => ({
  code,
  msg: message,
  data: null,
})

// 7. 测试用户数据
function getMockSession() {
  return {
    user: {
      id: 'test-user-id-123',
      status: 1,
      name: 'Test User',
      loginName: 'Test User',
      email: 'test@example.com',
      picture: '',
      phone: '',
      nickname: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    },
    userWorkspaces: {
      default: {
        workspaceId: '54f713cb-ba98-41f2-a3a1-7779762e33ac',
        userId: 'test-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        inviterId: null,
        role: UserWorkspaceRole.admin,
      },
    },
  }
}

// 8. 中间件
const authMiddleware = CONFIG.USE_TEST_AUTH
  ? (req: Request, res: Response, next: NextFunction) => {
    req.session = getMockSession()
    next()
  }
  : authenticationMiddleware

const handleError = (err: unknown, req: Request, res: Response, operation: string) => {
  logger().error({
    msg: `Failed to ${operation}`,
    data: {
      error: err,
      errorMessage: err instanceof Error ? err.message : '未知错误',
      errorStack: err instanceof Error ? err.stack : undefined,
      requestData: req.body || req.query,
      userId: req.session?.user?.id,
    },
  })

  return res.status(500).json({
    code: 500,
    msg: '服务器内部错误',
    data: null,
  })
}

const validateSchema = <T>(schema: z.ZodSchema<T>, data: unknown, operation: string) => {
  const result = schema.safeParse(data)
  if (!result.success) {
    logger().error({
      msg: `Invalid ${operation} input`,
      data: {
        errors: result.error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        })),
        requestData: data,
      },
    })
    return null
  }
  return result.data
}

// 9. SSE 相关函数
function setupSSEConnection(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
}

// 添加错误消息格式化函数
const formatErrorMessage = (error: unknown): string => {
  // 记录原始错误信息到日志
  logger().error({
    msg: 'Error details',
    data: {
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
    },
  })

  return [
    '```error',
    '抱歉，操作未能成功，请稍后再试。如果问题持续，请联系我们的支持团队！ 🙏',
    '```',
  ].join('\n')
}

// 修改 SSE 错误处理函数
const sendSSEError = async (res: Response, error: unknown, updateTarget?: UpdateTarget) => {
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

// 定义更新类型
type UpdateTarget = {
  type: 'chat_record' | 'chat_title'
  chatId: string
  roundId?: string
}

// 在全局范围内添加一个 Map 来存储活跃的请求控制器
const activeRequests = new Map<string, AbortController>()

async function handleStreamResponse(
  response: FetchResponse,
  res: Response,
  updateTarget: UpdateTarget,
  controller?: AbortController
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is empty')
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
        data: { status: CONFIG.CHAT_STATUS.CHATTING }, // 聊天中状态
      })

      logger().info({
        msg: 'Chat status updated to CHATTING',
        data: { roundId: updateTarget.roundId, status: CONFIG.CHAT_STATUS.CHATTING },
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
                      status: CONFIG.CHAT_STATUS.COMPLETED,
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
              status: CONFIG.CHAT_STATUS.COMPLETED,
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
              status: CONFIG.CHAT_STATUS.FAILED,
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

// 10. 缓存中间件
const cacheMiddleware = (duration: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `__express__${req.originalUrl || req.url}`
    const cachedBody = cache.get(key) as CachedResponse | undefined

    if (cachedBody) {
      return res.json(cachedBody)
    } else {
      const extendedRes = res as ExtendedResponse
      extendedRes.sendResponse = res.json.bind(res)
      res.json = (body: CachedResponse) => {
        cache.put(key, body, duration * 1000)
        extendedRes.sendResponse(body)
        return res
      }
      next()
    }
  }
}

// 11. Fetch 工具函数
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { body?: string | URLSearchParams | Buffer | FormData },
  timeout: number
): Promise<FetchResponse> {
  const controller = options.signal 
    ? undefined  // 如果已经传入了 signal，就不创建新的 controller
    : new AbortController();
    
  const timeoutId = controller 
    ? setTimeout(() => {
        controller.abort();
        logger().warn({
          msg: 'Request timeout',
          data: { url, timeout }
        });
      }, timeout)
    : undefined;

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller?.signal,
    });
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return response;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}

// 12. 路由设置
export default function chatRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

// Chat 创建路由
router.post(
  '/create',
  authMiddleware,
  // createChatLimiter,
  async (req: Request, res: Response) => {
    try {
      const validatedData = validateSchema(createChatSchema, req.body, 'create chat')
      if (!validatedData) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { type, fileId } = validatedData
      const chatId = uuidv4()
      const userId = req.session.user.id
      const title = sanitizeInput(type === 'rag' ? 'Untitled' : '新的报告')

      logger().info({
        msg: 'Attempting to create chat',
        data: { type, fileId, userId },
      })

      if (type === 'report' && fileId) {
        const userFile = await prisma().userFile.findFirst({
          where: {
            fileId,
            createdUserId: userId,
          },
          select: { fileId: true },
        })

        if (!userFile) {
          throw new AuthorizationError('文件不存在或无权访问')
        }
      }

      const workspace = Object.values(req.session.userWorkspaces ?? {})[0]
      if (!workspace?.workspaceId) {
        throw new ValidationError('未找到有效的工作区')
      }

      const response = await prisma().$transaction(async (tx) => {
        // 创建聊天
        const chat = await tx.chat.create({
          data: {
            id: chatId,
            userId,
            title,
            type: type === 'rag' ? 1 : 2,
          },
        })

        // 创建初始问答记录，question 默认为空字符串
        const recordId = uuidv4();
        const chatRecord = await tx.chatRecord.create({
          data: {
            id: recordId,
            chatId: chat.id,
            roundId: recordId,  // 使用相同的 ID 作为 roundId
            question: '',  // 默认空字符串
            answer: Buffer.from(''),
            speakerType: 'user',
            status: CONFIG.CHAT_STATUS.START,
          },
        })

        // 如果是报告类型，创建文件关联
        if (type === 'report') {
          await tx.chatRecordFileRelation.create({
            data: {
              id: uuidv4(),
              chatRecordId: chatRecord.id,
              fileId,
            },
          })
        }

        let documentId = null
        if (type === 'report') {
          const doc = await createDocument(workspace.workspaceId, {
            id: uuidv4(),
            title: sanitizeInput('新的报告'),
            orderIndex: -1,
          }, tx)
          documentId = doc.id

          await Promise.all([
            tx.chatDocumentRelation.create({
              data: {
                chatId: chat.id,
                documentId: doc.id,
              },
            }),
            tx.chatFileRelation.create({
              data: {
                chatId: chat.id,
                fileId,
              },
            }),
          ])
        }

        return {
          id: chat.id,
          documentId,
          title: chat.title,
          type: type,
          createdTime: formatDate(chat.createdTime),
          workspaceId: workspace.workspaceId,
        }
      })

      logger().info({
        msg: 'Chat created successfully',
        data: response,
      })

      return res.json({
        code: 0,
        data: response,
        msg: '创建成功',
      })
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      if (err instanceof ValidationError) {
        return res.status(400).json(createErrorResponse(400, err.message))
      }
      return handleError(err, req, res, 'create chat')
    }
  }
)

// Chat 列表路由
// router.get('/list', authMiddleware, cacheMiddleware(60), async (req, res) => {
router.get('/list', authMiddleware, async (req, res) => {
  try {
    logger().info({
      msg: 'Attempting to fetch chat list',
      data: {
        userId: req.session.user.id,
      },
    })

    const chats = await prisma().chat.findMany({
      where: {
        userId: req.session.user.id,
      },
      select: {
        id: true,
        title: true,
        type: true,
        createdTime: true,
        documentRelations: {
          select: {
            documentId: true,
          },
        },
      },
      orderBy: {
        createdTime: 'desc',
      },
    })

    const chatList = chats.map((chat) => ({
      id: chat.id,
      documentId: chat.documentRelations[0]?.documentId || null,
      title: sanitizeInput(chat.title),
      type: chat.type === 1 ? 'rag' : 'report',
      createdTime: formatDate(chat.createdTime),
    }))

    logger().info({
      msg: 'Chat list fetched successfully',
      data: {
        userId: req.session.user.id,
        count: chatList.length,
      },
    })

    return res.json({
      code: 0,
      data: {
        list: chatList,
      },
      msg: '获取成功',
    })
  } catch (err) {
    return handleError(err, req, res, 'fetch chat list')
  }
})

// Chat 更新路由
router.post('/update', authMiddleware, async (req, res) => {
  try {
    const validatedData = validateSchema(updateChatSchema, req.body, 'update chat title')
    if (!validatedData) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { id, title } = validatedData

    logger().info({
      msg: 'Attempting to update chat title',
      data: {
        chatId: id,
        newTitle: title,
        userId: req.session.user.id,
      },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id,
        userId: req.session.user.id,
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    const sanitizedTitle = sanitizeInput(title)

    await prisma().chat.update({
      where: { id },
      data: { title: sanitizedTitle },
    })

    logger().info({
      msg: 'Chat title updated successfully',
      data: {
        chatId: id,
        newTitle: sanitizedTitle,
        userId: req.session.user.id,
      },
    })

    return res.json({
      code: 0,
      data: {},
      msg: '更新成功',
    })
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return res.status(403).json(createErrorResponse(403, err.message))
    }
    if (err instanceof ValidationError) {
      return res.status(400).json(createErrorResponse(400, err.message))
    }
    return handleError(err, req, res, 'update chat title')
  }
})

// Chat 删除路由
router.post('/delete', authMiddleware, async (req, res) => {
  let validatedData;
  try {
    validatedData = validateSchema(deleteChatSchema, req.body, 'delete chat')
    if (!validatedData) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { id } = validatedData

    logger().info({
      msg: 'Attempting to delete chat',
      data: {
        chatId: id,
        userId: req.session.user.id,
      },
    })

    // 先检查聊天是否存在且属于当前用户
    const chat = await prisma().chat.findFirst({
      where: {
        id,
        userId: req.session.user.id,
      },
    })

    if (!chat) {
      return res.status(404).json(createErrorResponse(404, '对话不存在或无权限删除'))
    }

    let filesToDelete: { fileId: string, filePath: string }[] = []

    // 使用事务确保数据一致性
    await prisma().$transaction(async (tx) => {
      // 0. 获取关联的文件信息
      const fileRelations = await tx.chatFileRelation.findMany({
        where: { chatId: id },
        include: {
          userFile: {
            select: {
              fileId: true,
              filePath: true
            }
          }
        }
      })
      filesToDelete = fileRelations.map(relation => ({
        fileId: relation.userFile.fileId,
        filePath: relation.userFile.filePath
      }))

      // 1. 获取关联的文档ID
      const documentRelation = await tx.chatDocumentRelation.findFirst({
        where: { chatId: id },
        select: { documentId: true }
      })

      // 2. 删除聊天记录
      await tx.chatRecord.deleteMany({
        where: { chatId: id }
      })

      // 3. 删除文档关联
      await tx.chatDocumentRelation.deleteMany({
        where: { chatId: id }
      })

      // 4. 删除文件关联
      await tx.chatFileRelation.deleteMany({
        where: { chatId: id }
      })

      // 5. 删除关联的UserFile记录
      if (filesToDelete.length > 0) {
        await tx.userFile.deleteMany({
          where: {
            fileId: {
              in: filesToDelete.map(file => file.fileId)
            }
          }
        })
      }

      // 6. 如果存在关联文档，删除文档
      if (documentRelation?.documentId) {
        await tx.document.delete({
          where: { id: documentRelation.documentId }
        })
      }

      // 7. 删除聊天主记录
      await tx.chat.delete({
        where: { id }
      })
    })

    // 事务成功后，删除磁盘文件
    for (const file of filesToDelete) {
      try {
        await fs.unlink(file.filePath)
      } catch (error) {
        logger().error({
          msg: 'Failed to delete file from disk',
          data: {
            error,
            fileId: file.fileId,
            filePath: file.filePath
          }
        })
      }
    }

    logger().info({
      msg: 'Chat deleted successfully',
      data: {
        chatId: id,
        userId: req.session.user.id,
      },
    })

    return res.json({
      code: 0,
      data: null,
      msg: '删除成功',
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to delete chat',
      data: {
        chatId: validatedData?.id,
        userId: req.session.user.id,
        error: err
      },
    })

    return res.status(500).json(createErrorResponse(500, '删除失败'))
  }
})

// Chat Round 创建路由
router.post('/round/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = validateSchema(createChatRoundSchema, req.body, 'create chat round')
    if (!validatedData) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { chatId, question } = validatedData
    const userId = req.session.user.id

    logger().info({
      msg: 'Attempting to create chat round',
      data: { chatId, userId },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId: req.session.user.id,
      },
      include: {
        records: {
          orderBy: { createdTime: 'asc' },
        },
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    let chatRecord
    if (chat.records && chat.records.length === 1 && chat.records[0]?.status === CONFIG.CHAT_STATUS.START) {
      // 更新现有记录
      chatRecord = await prisma().chatRecord.update({
        where: { id: chat.records[0].id },
        data: {
          question: sanitizeInput(question),
          status: CONFIG.CHAT_STATUS.START,
          updateTime: new Date(),
        },
      })

      logger().info({
        msg: 'Updated existing chat record',
        data: {
          recordId: chatRecord.id,
          chatId,
          userId,
        },
      })
    } else {
      // 创建新记录
      chatRecord = await prisma().chatRecord.create({
        data: {
          id: uuidv4(),
          chatId,
          roundId: uuidv4(), // 使用新的 ID 作为 roundId
          question: sanitizeInput(question),
          answer: Buffer.from(''),
          speakerType: 'user',
          status: CONFIG.CHAT_STATUS.START,
        },
      })

      logger().info({
        msg: 'Created new chat record',
        data: {
          recordId: chatRecord.roundId,
          chatId,
          userId,
        },
      })
    }

    return res.json({
      code: 0,
      data: {
        id: chatRecord.roundId,
      },
      msg: '创建成功',
    })
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return res.status(403).json(createErrorResponse(403, err.message))
    }
    if (err instanceof ValidationError) {
      return res.status(400).json(createErrorResponse(400, err.message))
    }
    return handleError(err, req, res, 'create chat round')
  }
})

// Chat 详情路由
router.post(
  '/detail',
  authMiddleware,
  // cacheMiddleware(CONFIG.CHAT_DETAIL_CACHE_DURATION),
  async (req: Request, res: Response) => {
    try {
      const validatedData = validateSchema(getChatDetailSchema, req.body, 'get chat detail')
      if (!validatedData) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { id } = validatedData
      const userId = req.session.user.id

      logger().info({
        msg: 'Attempting to get chat detail',
        data: { chatId: id, userId },
      })

      const chat = await prisma().chat.findFirst({
        where: {
          id,
          userId,
        },
        select: {
          id: true,
          type: true,
          records: {
            orderBy: {
              createdTime: 'asc',
            },
            select: {
              id: true,
              question: true,
              speakerType: true,
              answer: true,
              status: true,
              createdTime: true,
            },
          },
          documentRelations: {
            select: {
              document: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
          fileRelations: {
            select: {
              userFile: {
                select: {
                  fileId: true,
                  fileName: true,
                },
              },
            },
          },
        },
      })

      if (!chat) {
        throw new AuthorizationError('聊天记录不存在或无权访问')
      }

      // 首先按时间排序聊天记录
      const sortedRecords = [...chat.records].sort((a, b) => 
        a.createdTime.getTime() - b.createdTime.getTime()
      );

      // 转换聊天记录为消息格式
      const messages = sortedRecords.flatMap((record) => {
        const messages = [];

        // 只有当 question 有内容时才添加 user 消息
        if (record.question) {
          messages.push({
            id: record.id,
            role: 'user',
            content: sanitizeInput(record.question),
            status: 'success',
          });
        }

        // 只有当 answer 有内容时才添加 assistant 消息
        const answerContent = record.answer.toString();
        if (answerContent) {
          messages.push({
            id: record.id,
            role: 'assistant',
            content: answerContent,
            status: (() => {
              switch (record.status) {
                case CONFIG.CHAT_STATUS.FAILED:
                  return 'error'
                case CONFIG.CHAT_STATUS.CHATTING:
                  return 'chatting'
                case CONFIG.CHAT_STATUS.START:
                case CONFIG.CHAT_STATUS.COMPLETED:
                default:
                  return 'success'
              }
            })(),
          });
        }

        return messages;
      });

      const responseData: ChatDetailResponse = {
        type: chat.type === 1 ? 'rag' : 'report',
        messages,
        documentId: null,
        file: null,
      }

      if (chat.type === 2) {
        const documentRelation = chat.documentRelations[0]
        const fileRelation = chat.fileRelations[0]

        if (documentRelation?.document) {
          responseData.documentId = documentRelation.document.id
        }

        if (fileRelation?.userFile) {
          responseData.file = {
            id: fileRelation.userFile.fileId,
            name: sanitizeInput(fileRelation.userFile.fileName),
            type: fileRelation.userFile.fileName.split('.').pop() || '',
          }
        }
      }

      logger().info({
        msg: 'Chat detail retrieved successfully',
        data: {
          chatId: id,
          userId,
          type: responseData.type,
          messageCount: messages.length,
        },
      })

      return res.json({
        code: 0,
        data: responseData,
        msg: '获取成功',
      })
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      return handleError(err, req, res, 'get chat detail')
    }
  }
)

// Chat Completions 路由
router.get(
  '/completions',
  authMiddleware,
  // completionsLimiter,
  async (req: Request, res: Response) => {
    // 在路由开始就建立 SSE 连接
    setupSSEConnection(res)

    const controller = new AbortController()

    try {
      const validatedData = validateSchema(chatCompletionsSchema, req.query, 'chat completions')
      if (!validatedData) {
        await sendSSEError(res, new ValidationError('参数校验失败'), {
          type: 'chat_record',
          chatId: req.query['chatId'] as string,
          roundId: req.query['roundId'] as string,
        })
        return
      }

      const { chatId, roundId } = validatedData

      validateEnvVars()

      const chatRecord = await prisma().chatRecord.findFirst({
        where: {
          id: roundId,
          chatId: chatId,
          chat: {
            userId: req.session.user.id,
          },
        },
        select: {
          id: true,
          question: true,
          speakerType: true,
          chat: {
            select: {
              id: true,
              type: true,
              fileRelations: {
                select: {
                  userFile: {
                    select: {
                      fileId: true,
                      fileName: true,
                      filePath: true,
                    }
                  }
                }
              }
            },
          },
        },
      })

      if (!chatRecord) {
        await sendSSEError(res, new AuthorizationError('对话记录不存在或无权访问'), {
          type: 'chat_record',
          chatId,
          roundId,
        })
        return
      }

      try {
        // 根据聊天类型进行不同处理
        if (chatRecord.chat.type === 2) { // report类型
          logger().info({
            msg: 'Processing report type chat',
            data: {
              chatId,
              roundId,
              userId: req.session.user.id
            }
          })

          // 获取关联的文件
          const fileRelation = chatRecord.chat.fileRelations[0]
          if (!fileRelation?.userFile) {
            await sendSSEError(res, new ValidationError('未找到关联的文件'), {
              type: 'chat_record',
              chatId,
              roundId,
            })
            return
          }

          const userFile = fileRelation.userFile
          const fileContent = await fs.readFile(userFile.filePath)

          // 构建请求体
          const formData = new FormData();
          formData.append('user_input', chatRecord.question);
          formData.append('docx_report', new Blob([fileContent]), userFile.fileName);

          // 调用AI Agent接口
          logger().info({
            msg: 'Sending report request to AI Agent',
            data: {
              url: `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.REPORT_COMPLETIONS}`,
              timeout: CONFIG.AI_AGENT_TIMEOUT,
              filename: userFile.fileName,
              question: chatRecord.question
            }
          });

          const fetchResponse = await fetchWithTimeout(
            `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.REPORT_COMPLETIONS}`,
            {
              method: 'POST',
              body: formData,
              headers: {
                'Accept': 'text/event-stream'
              },
              signal: controller.signal
            },
            60000  // 增加超时时间到 60 秒
          )

          if (!fetchResponse.ok) {
            throw new Error(`AI 报告对话请求失败: ${fetchResponse.status}`)
          }

          await handleReportStreamResponse(
            fetchResponse,
            req,
            res,
            chatId,
            roundId,
            socketServer,
            controller
          )
        } else { // rag类型
          const messages: Message[] = [
            {
              id: chatRecord.id,
              role: 'user',
              content: sanitizeInput(chatRecord.question),
            },
          ]

          // 先打印请求参数日志
          logger().info({
            msg: 'Relation check request',
            data: {
              url: `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.RELATION_CHECK}`,
              requestBody: { messages },
              chatId,
              roundId,
            },
          })

          const relationCheckResponse = await fetchWithTimeout(
            `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.RELATION_CHECK}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages }),
            },
            5000
          )

          if (!relationCheckResponse.ok) {
            throw new Error(`关联性检查请求失败: ${relationCheckResponse.status}`)
          }

          const relationResult = (await relationCheckResponse.json()) as RelationCheckResponse

          // 打印响应结果日志
          logger().info({
            msg: 'Relation check response',
            data: {
              response: relationResult,
              chatId,
              roundId,
              userId: req.session.user.id,
            },
          })

          if (relationResult.code !== 0 || !relationResult.data.related) {
            logger().info({
              msg: 'Chat content not related',
              data: { roundId, chatId },
            })

            const errorMessage = [
              '```content',
              '抱歉，我目前无法回答与查找数据无关的内容。如果您有查找数据需求，请随时告诉我！',
              '```',
            ]

            const userInput = chatRecord.question
            const title = userInput.slice(0, 15) // 截取前15个字

            try {
              // 更新 ChatRecord 状态为结束，并存储错误信息和标题
              await prisma().$transaction(async (tx) => {
                // 更新 ChatRecord
                await tx.chatRecord.update({
                  where: { id: roundId },
                  data: {
                    status: CONFIG.CHAT_STATUS.COMPLETED, // 结束状态
                    answer: Buffer.from(errorMessage.join('\n')),
                    speakerType: 'assistant',
                    updateTime: new Date(),
                  },
                })

                // 检查是否已设置标题
                const chat = await tx.chat.findUnique({
                  where: { id: chatId },
                  select: { isTitleSet: true }
                })

                // 只有当标题未设置时才更新标题
                if (!chat?.isTitleSet) {
                  const userInput = chatRecord.question
                  const title = userInput.slice(0, 15) // 截取前15个字
                  await tx.chat.update({
                    where: { id: chatId },
                    data: {
                      title: title,
                      isTitleSet: true,
                      updateTime: new Date(),
                    },
                  })

                  // 发送标题更新事件
                  const updateData = {
                    chatId: chatId,
                    title: title,
                  }

                  logger().info({
                    msg: 'Emitting title update event for unrelated content',
                    data: updateData,
                  })

                  titleUpdateEmitter.emit('titleUpdate', updateData)

                  logger().info({
                    msg: 'Title update event emitted for unrelated content',
                    data: {
                      chatId,
                      listenerCount: titleUpdateEmitter.listenerCount('titleUpdate'),
                    },
                  })
                }
              })
            } catch (dbError) {
              logger().error({
                msg: 'Failed to update database for unrelated content',
                data: {
                  error: dbError instanceof Error ? dbError.message : 'Unknown error',
                  chatId,
                  roundId,
                },
              })
              // 使用sendSSEError处理数据库错误
              await sendSSEError(res, dbError, {
                type: 'chat_record',
                chatId,
                roundId,
              })
              return
            }

            errorMessage.forEach((line) => {
              res.write(`data: ${line}\n`)
            })
            res.write('\n') // 表示该消息结束
            res.write(`data: [DONE]\n\n`)
            return
          }

          logger().info({
            msg: 'Sending request to AI Agent',
            data: {
              url: `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.DATA_COMPLETIONS}`,
              timeout: CONFIG.AI_AGENT_TIMEOUT,
              messages: messages
            }
          });

          const response = (await fetchWithTimeout(
            `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.DATA_COMPLETIONS}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_input: chatRecord.question,
              }),
              signal: controller.signal, // 添加 signal
            },
            30000
          )) as FetchResponse

          if (!response.ok) {
            throw new Error(`AI 对话请求失败: ${response.status}`)
          }

          await handleStreamResponse(
            response,
            res,
            {
              type: 'chat_record',
              chatId: chatId,
              roundId: roundId,
            },
            controller
          ) // 传入 controller
        }
      } catch (error) {
        logger().error({
          msg: 'AI service error',
          data: { error },
        })
        await sendSSEError(res, error, {
          type: 'chat_record',
          chatId,
          roundId,
        })
      }
    } catch (err) {
      await sendSSEError(res, err, {
        type: 'chat_record',
        chatId: req.query['chatId'] as string,
        roundId: req.query['roundId'] as string,
      })
    }
  }
)

// Chat 总结路由
router.get(
  '/summarize',
  authMiddleware,
  // summarizeLimiter,
  async (req, res) => {
    // 在路由开始就建立 SSE 连接
    setupSSEConnection(res)

    try {
      const validatedData = validateSchema(summarizeChatSchema, req.query, 'summarize chat')
      if (!validatedData) {
        await sendSSEError(res, new ValidationError('参数校验失败'), {
          type: 'chat_title',
          chatId: req.query['chatId'] as string,
        })
        return
      }

      const { chatId, roundId } = validatedData

      validateEnvVars()

      const chatRecord = await prisma().chatRecord.findFirst({
        where: {
          id: roundId,
          chatId: chatId,
          chat: {
            userId: req.session.user.id,
          },
        },
        select: {
          id: true,
          question: true,
          answer: true,
          speakerType: true,
        },
      })

      if (!chatRecord) {
        await sendSSEError(res, new AuthorizationError('对话记录不存在或无权访问'), {
          type: 'chat_title',
          chatId,
        })
        return
      }

      try {
        const messages = [
          {
            id: chatRecord.id,
            role: 'user',
            content: sanitizeInput(chatRecord.question),
          },
          {
            id: chatRecord.id,
            role: 'assistant',
            content: chatRecord.answer.toString(),
          },
        ]

        // 添加请求参数日志
        logger().info({
          msg: 'Summarize request parameters',
          data: {
            url: `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.SUMMARIZE}`,
            requestBody: {
              messages,
              temperature: 0,
            },
            chatId,
            roundId,
            userId: req.session.user.id,
          },
        })

        logger().info({
          msg: 'Sending request to AI Agent',
          data: {
            url: `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.SUMMARIZE}`,
            timeout: CONFIG.AI_AGENT_TIMEOUT,
            messages: messages
          }
        });

        const response = (await fetchWithTimeout(
          `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.SUMMARIZE}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages,
              temperature: 0,
            }),
          },
          10000
        )) as FetchResponse

        if (!response.ok) {
          throw new Error(`AI 总结请求失败: ${response.status}`)
        }

        // 添加响应状态日志
        logger().info({
          msg: 'Summarize response status',
          data: {
            status: response.status,
            statusText: response.statusText,
            chatId,
            roundId,
            userId: req.session.user.id,
          },
        })

        await handleStreamResponse(response, res, {
          type: 'chat_title',
          chatId: chatId,
        })
      } catch (error) {
        logger().error({
          msg: 'AI summarization error',
          data: { error },
        })
        await sendSSEError(res, error, {
          type: 'chat_title',
          chatId,
        })
      }
    } catch (err) {
      await sendSSEError(res, err, {
        type: 'chat_title',
        chatId: req.query['chatId'] as string,
      })
    }
  }
)

// Chat 状态查询路由
router.post('/status', authMiddleware, async (req, res) => {
  try {
    const validatedData = validateSchema(getChatStatusSchema, req.body, 'get chat status')
    if (!validatedData) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { chatId } = validatedData
    const userId = req.session.user.id

    logger().info({
      msg: 'Attempting to get chat status',
      data: { chatId, userId },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
      select: {
        id: true,
        records: {
          orderBy: {
            createdTime: 'desc',
          },
          take: 1,
          select: {
            status: true,
            id: true,
          },
        },
      },
    })

    if (!chat) {
      throw new AuthorizationError('聊天记录不存在或无权访问')
    }

    const status = chat.records[0]?.status === CONFIG.CHAT_STATUS.CHATTING ? 'chatting' : 'idle'
    const roundId = status === 'chatting' ? chat.records[0]?.id : ''

    logger().info({
      msg: 'Chat status retrieved successfully',
      data: {
        chatId,
        userId,
        status,
        roundId,
      },
    })

    return res.json({
      code: 0,
      data: {
        status,
        roundId,
      },
      msg: '获取成功',
    })
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return res.status(403).json(createErrorResponse(403, err.message))
    }
    return handleError(err, req, res, 'get chat status')
  }
})

// 添加停止聊天路由
router.post('/stop', authMiddleware, async (req: Request, res: Response) => {
  try {
    const validatedData = validateSchema(stopChatSchema, req.body, 'stop chat')
    if (!validatedData) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { roundId } = validatedData
    const userId = req.session.user.id

    logger().info({
      msg: 'Attempting to stop chat',
      data: { roundId, userId },
    })

    // 查找对话记录并验证权限
    const chatRecord = await prisma().chatRecord.findFirst({
      where: {
        id: roundId,
        chat: {
          userId,
        },
      },
      select: {
        id: true,
        chatId: true,
        status: true,
        answer: true,
      },
    })

    if (!chatRecord) {
      throw new AuthorizationError('对话记录不存在或无权访问')
    }

    if (chatRecord.status !== CONFIG.CHAT_STATUS.CHATTING) {
      logger().info({
        msg: 'Chat already stopped or completed',
        data: { roundId, status: chatRecord.status },
      })
      return res.json({
        code: 0,
        data: {},
        msg: '对话已经停止或完成',
      })
    }

    // 尝试中断正在进行的请求
    const controller = activeRequests.get(roundId)
    if (controller) {
      logger().info({
        msg: 'Aborting active request',
        data: { roundId },
      })
      controller.abort()
      activeRequests.delete(roundId)
    }

    // 更新对话态为完成
    const currentAnswer = chatRecord.answer.toString()
    const updatedAnswer = currentAnswer.includes('[DONE]')
      ? currentAnswer
      : `${currentAnswer}\n[DONE]`

    await prisma().$transaction([
      prisma().chatRecord.update({
        where: { id: roundId },
        data: {
          status: CONFIG.CHAT_STATUS.COMPLETED,
          answer: Buffer.from(updatedAnswer),
          speakerType: 'assistant',
          updateTime: new Date(),
        },
      }),
      prisma().chat.update({
        where: { id: chatRecord.chatId },
        data: {
          updateTime: new Date(),
        },
      }),
    ])

    logger().info({
      msg: 'Chat stopped successfully',
      data: {
        roundId,
        chatId: chatRecord.chatId,
        userId,
      },
    })

    return res.json({
      code: 0,
      data: {},
      msg: '停止成功',
    })
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return res.status(403).json(createErrorResponse(403, err.message))
    }
    return handleError(err, req, res, 'stop chat')
  }
})

// 添加标题更新 SSE 路由
router.get('/title/update', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.user.id

    logger().info({
      msg: 'Title update SSE connection established',
      data: {
        userId,
        currentListeners: titleUpdateEmitter.listenerCount('titleUpdate'),
      },
    })

    // 设置 SSE 头部
    setupSSEConnection(res)

    // 创建标题更新处理函数
    const handleTitleUpdate = async (data: { chatId: string; title: string }) => {
      logger().info({
        msg: 'Received title update event',
        data: {
          userId,
          chatId: data.chatId,
          title: data.title,
        },
      })

      try {
        // 验证该聊天是否属于当前用户
        const chat = await prisma().chat.findUnique({
          where: { id: data.chatId },
          select: { userId: true }
        })

        if (chat && chat.userId === userId) {
          const message = JSON.stringify({
            chatId: data.chatId,
            title: data.title,
          })

          logger().info({
            msg: 'Sending title update via SSE',
            data: {
              userId,
              chatId: data.chatId,
              title: data.title,
              messageContent: message,
            },
          })

          // 确保连接仍然打开
          if (!res.writableEnded) {
            res.write(`data: ${message}\n\n`)
          } else {
            logger().warn({
              msg: 'SSE connection already closed',
              data: { userId, chatId: data.chatId },
            })
          }
        } else {
          logger().warn({
            msg: 'Attempted to send title update for unauthorized chat',
            data: {
              userId,
              chatId: data.chatId,
            },
          })
        }
      } catch (error) {
        logger().error({
          msg: 'Error processing title update',
          data: {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            userId,
            chatId: data.chatId,
          },
        })
      }
    }

    // 注册事件监听器
    titleUpdateEmitter.on('titleUpdate', handleTitleUpdate)

    logger().info({
      msg: 'Title update event listener registered',
      data: {
        userId,
        totalListeners: titleUpdateEmitter.listenerCount('titleUpdate'),
      },
    })

    // 发送初始连接成功消息
    res.write('data: {"connected":true}\n\n')

    // 当客户端断开连接时清理
    req.on('close', () => {
      titleUpdateEmitter.off('titleUpdate', handleTitleUpdate)

      logger().info({
        msg: 'Title update SSE connection closed',
        data: {
          userId,
          remainingListeners: titleUpdateEmitter.listenerCount('titleUpdate'),
        },
      })

      // 确保连接被正确关闭
      if (!res.writableEnded) {
        res.end()
      }
    })
  } catch (err) {
    logger().error({
      msg: 'Title update SSE error',
      data: {
        error: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        userId: req.session.user.id,
      },
    })
    if (!res.writableEnded) {
      res.end()
    }
  }
})

// 初始化验证
validateEnvVars()

return router
}
