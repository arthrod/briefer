import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '@briefer/database'
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

// 1. 将所有配置常量集中到一个对象中
const CONFIG = {
  USE_TEST_AUTH: false, // 测试模式开关，如果为 true，则使用 mock 数据
  AI_AGENT_URL: process.env['AI_AGENT_URL'],
  CHAT_DETAIL_CACHE_DURATION: 60,
  RATE_LIMITS: {
    API: {
      windowMs: 15 * 60 * 1000,
      max: 100
    },
    CREATE_CHAT: {
      windowMs: 60 * 1000,
      max: 20
    },
    COMPLETIONS: {
      windowMs: 60 * 1000,
      max: 10
    },
    SUMMARIZE: {
      windowMs: 60 * 1000,
      max: 10
    }
  },
  CHAT_STATUS: {
    START: 1,
    CHATTING: 2,
    COMPLETED: 3,
    FAILED: 4
  }
} as const

// 2. 速率限制器配置
const apiLimiter = rateLimit({
  windowMs: CONFIG.RATE_LIMITS.API.windowMs,
  max: CONFIG.RATE_LIMITS.API.max
})

const createChatLimiter = rateLimit({
  windowMs: CONFIG.RATE_LIMITS.CREATE_CHAT.windowMs,
  max: CONFIG.RATE_LIMITS.CREATE_CHAT.max
})

const completionsLimiter = rateLimit({
  windowMs: CONFIG.RATE_LIMITS.COMPLETIONS.windowMs,
  max: CONFIG.RATE_LIMITS.COMPLETIONS.max
})

const summarizeLimiter = rateLimit({
  windowMs: CONFIG.RATE_LIMITS.SUMMARIZE.windowMs,
  max: CONFIG.RATE_LIMITS.SUMMARIZE.max
})

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
const createChatSchema = z.object({
  type: z.enum(['rag', 'report']),
  fileId: z.string()
})

const updateChatSchema = z.object({
  id: z.string().min(1, "对话ID不能为空"),
  title: z.string().min(1, "标题不能为空"),
})

const deleteChatSchema = z.object({
  id: z.string().min(1, "对话ID不能为空"),
})

const createChatRoundSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  chatId: z.string().min(1, "聊天ID不能为空"),
})

const getChatDetailSchema = z.object({
  id: z.string().min(1, "聊天ID不能为空"),
})

const chatCompletionsSchema = z.object({
  chatId: z.string().min(1, "对话ID不能为空"),
  roundId: z.string().min(1, "对话轮次ID不能为空"),
})

const summarizeChatSchema = z.object({
  chatId: z.string().min(1, "对话ID不能为空"),
  roundId: z.string().min(1, "对话轮次ID不能为空"),
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
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
}

const createErrorResponse = (code: number, message: string): ErrorResponse => ({
  code,
  msg: message,
  data: null
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
    },
    userWorkspaces: {
      default: {
        workspaceId: '54f713cb-ba98-41f2-a3a1-7779762e33ac',
        userId: 'test-user-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        inviterId: null,
        role: UserWorkspaceRole.admin
      }
    }
  }
}

// 8. 中间件
const authMiddleware = CONFIG.USE_TEST_AUTH
  ? ((req: Request, res: Response, next: NextFunction) => {
    req.session = getMockSession();
    next();
  })
  : authenticationMiddleware;

const handleError = (err: unknown, req: Request, res: Response, operation: string) => {
  logger().error({
    msg: `Failed to ${operation}`,
    data: {
      error: err,
      errorMessage: err instanceof Error ? err.message : '未知错误',
      errorStack: err instanceof Error ? err.stack : undefined,
      requestData: req.body || req.query,
      userId: req.session?.user?.id
    }
  })

  return res.status(500).json({
    code: 500,
    msg: '服务器内部错误',
    data: null
  })
}

const validateSchema = <T>(schema: z.ZodSchema<T>, data: unknown, operation: string) => {
  const result = schema.safeParse(data)
  if (!result.success) {
    logger().error({
      msg: `Invalid ${operation} input`,
      data: {
        errors: result.error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        })),
        requestData: data
      }
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
    'Connection': 'keep-alive'
  })
  // res.write(`data: {"status": "success", "message": "SSE连接已建立"}\n\n`)
}

// 定义更新类型
type UpdateTarget = {
  type: 'chat_record' | 'chat_title';
  chatId: string;
  roundId?: string;
}

async function handleStreamResponse(
  response: FetchResponse,
  res: Response,
  updateTarget: UpdateTarget
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is empty')
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
        data: { status: CONFIG.CHAT_STATUS.CHATTING } // 聊天中状态
      })

      logger().info({
        msg: 'Chat status updated to CHATTING',
        data: { roundId: updateTarget.roundId, status: CONFIG.CHAT_STATUS.CHATTING }
      })
    }

    for await (const chunk of stream) {
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
              timestamp: new Date().toISOString()
            }
          })

          if (data.includes('[DONE]')) {
            // 根据不同类型更新不同的目标
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
                      updateTime: now
                    }
                  }),
                  // 同时更新对应的 Chat
                  prisma().chat.update({
                    where: {
                      id: updateTarget.chatId // 确保 chatId 也传入了
                    },
                    data: {
                      updateTime: now
                    }
                  })
                ])

                logger().info({
                  msg: 'Chat record and chat updated successfully',
                  data: {
                    roundId: updateTarget.roundId,
                    chatId: updateTarget.chatId,
                    messageLength: completeMessage.length,
                    updateTime: now
                  }
                })
              } else if (updateTarget.type === 'chat_title' && updateTarget.chatId) {
                await prisma().chat.update({
                  where: { id: updateTarget.chatId },
                  data: {
                    title: completeMessage.trim(),
                    updateTime: now
                  }
                })

                logger().info({
                  msg: 'Chat title updated successfully',
                  data: {
                    chatId: updateTarget.chatId,
                    newTitle: completeMessage.trim(),
                    updateTime: now
                  }
                })
              }
            } catch (dbError) {
              logger().error({
                msg: 'Failed to update database',
                data: {
                  updateTarget,
                  error: dbError instanceof Error ? dbError.message : 'Unknown error'
                }
              })
            }

            await fs.writeFile(logFilePath, completeMessage, 'utf-8')
            res.write(`data: [DONE]\n\n`)
            res.end()
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
                  timestamp: new Date().toISOString()
                }
              })

              res.write(`data: ${content}\n\n`)
            }
          } catch (parseError) {
            logger().error({
              msg: 'Failed to parse SSE JSON data',
              data: {
                rawData: data,
                error: parseError instanceof Error ? parseError.message : 'Unknown error'
              }
            })
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
          timestamp: new Date().toISOString()
        }
      })

      const data = buffer.trim()
      if (data.startsWith('data:')) {
        try {
          const jsonData = JSON.parse(data.slice(5).trim())
          const content = jsonData.choices?.[0]?.delta?.content || ''
          if (content && typeof content === 'string' && content.trim().length > 0) {
            completeMessage += content
            res.write(`data: ${content}\n\n`)
          }
        } catch (parseError) {
          logger().error({
            msg: 'Failed to parse final buffer JSON data',
            data: {
              rawData: data,
              error: parseError instanceof Error ? parseError.message : 'Unknown error'
            }
          })
        }
      }
    }

    // 打印完整的消息内容
    logger().info({
      msg: 'Complete SSE message',
      data: {
        completeMessage,
        messageLength: completeMessage.length,
        updateTarget,
        timestamp: new Date().toISOString()
      }
    })

    await fs.writeFile(logFilePath, completeMessage, 'utf-8')

  } catch (error) {
    logger().error({
      msg: 'SSE stream error',
      data: {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        updateTarget,
        filePath: logFilePath
      }
    })

    // 错误情况下也尝试保存
    try {
      const now = new Date()

      if (updateTarget.type === 'chat_record' && updateTarget.roundId) {
        await prisma().$transaction([
          prisma().chatRecord.update({
            where: { id: updateTarget.roundId },
            data: {
              answer: Buffer.from(completeMessage),
              speakerType: 'assistant',
              status: CONFIG.CHAT_STATUS.FAILED,
              updateTime: now
            }
          }),
          prisma().chat.update({
            where: {
              id: updateTarget.chatId
            },
            data: {
              updateTime: now
            }
          })
        ])
      } else if (updateTarget.type === 'chat_title' && updateTarget.chatId) {
        await prisma().chat.update({
          where: { id: updateTarget.chatId },
          data: {
            title: completeMessage.trim(),
            updateTime: now
          }
        })
      }
    } catch (dbError) {
      logger().error({
        msg: 'Failed to update database after error',
        data: {
          updateTarget,
          error: dbError instanceof Error ? dbError.message : 'Unknown error'
        }
      })
    }

    throw new Error(`处理流式响应时发生错误: ${error}`)
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
  options: RequestInit & { body?: string | URLSearchParams | Buffer },
  timeout: number
): Promise<FetchResponse> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

// 12. 路由设置
const router = Router({ mergeParams: true })
router.use(apiLimiter)

// Chat 创建路由
router.post('/create', authMiddleware, createChatLimiter, async (req: Request, res: Response) => {
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
      data: { type, fileId, userId }
    })

    if (type === 'report' && fileId) {
      const userFile = await prisma().userFile.findFirst({
        where: {
          fileId,
          createdUserId: userId
        },
        select: { fileId: true }
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
      const chat = await tx.chat.create({
        data: {
          id: chatId,
          userId,
          title,
          type: type === 'rag' ? 1 : 2
        }
      })

      let documentId = null
      if (type === 'report') {
        const doc = await tx.document.create({
          data: {
            id: uuidv4(),
            title: sanitizeInput('新的报告'),
            workspaceId: workspace.workspaceId,
            icon: 'DocumentIcon',
            orderIndex: -1
          }
        })
        documentId = doc.id

        await Promise.all([
          tx.chatDocumentRelation.create({
            data: {
              chatId: chat.id,
              documentId: doc.id
            }
          }),
          tx.chatFileRelation.create({
            data: {
              chatId: chat.id,
              fileId
            }
          })
        ])
      }

      return {
        chatId: chat.id,
        documentId,
        title: chat.title,
        type: type,
        createdTime: formatDate(chat.createdTime)
      }
    }, {
      timeout: 5000
    })

    logger().info({
      msg: 'Chat created successfully',
      data: {
        chatId: response.chatId,
        documentId: response.documentId,
        title: response.title,
        type: response.type,
        createdTime: response.createdTime,
        userId
      }
    })

    return res.json({
      code: 0,
      data: {
        id: response.chatId,
        documentId: response.documentId,
        title: response.title,
        type: response.type,
        createdTime: response.createdTime
      },
      msg: '创建成功'
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
})

// Chat 列表路由
// router.get('/list', authMiddleware, cacheMiddleware(60), async (req, res) => {
router.get('/list', authMiddleware, async (req, res) => {
  try {
    logger().info({
      msg: 'Attempting to fetch chat list',
      data: {
        userId: req.session.user.id
      }
    })

    const chats = await prisma().chat.findMany({
      where: {
        userId: req.session.user.id
      },
      select: {
        id: true,
        title: true,
        type: true,
        createdTime: true,
        documentRelations: {
          select: {
            documentId: true
          }
        }
      },
      orderBy: {
        createdTime: 'desc'
      }
    })

    const chatList = chats.map(chat => ({
      id: chat.id,
      documentId: chat.documentRelations[0]?.documentId || null,
      title: sanitizeInput(chat.title),
      type: chat.type === 1 ? 'rag' : 'report',
      createdTime: formatDate(chat.createdTime)
    }))

    logger().info({
      msg: 'Chat list fetched successfully',
      data: {
        userId: req.session.user.id,
        count: chatList.length
      }
    })

    return res.json({
      code: 0,
      data: {
        list: chatList
      },
      msg: '获取成功'
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
        userId: req.session.user.id
      }
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id,
        userId: req.session.user.id
      }
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    const sanitizedTitle = sanitizeInput(title)

    await prisma().chat.update({
      where: { id },
      data: { title: sanitizedTitle }
    })

    logger().info({
      msg: 'Chat title updated successfully',
      data: {
        chatId: id,
        newTitle: sanitizedTitle,
        userId: req.session.user.id
      }
    })

    return res.json({
      code: 0,
      data: {},
      msg: '更新成功'
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
  try {
    const validatedData = validateSchema(deleteChatSchema, req.body, 'delete chat')
    if (!validatedData) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { id } = validatedData

    logger().info({
      msg: 'Attempting to delete chat',
      data: {
        chatId: id,
        userId: req.session.user.id
      }
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id,
        userId: req.session.user.id
      },
      select: {
        id: true,
        documentRelations: {
          select: {
            documentId: true
          }
        }
      }
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    await prisma().$transaction(async (tx) => {
      if (chat.documentRelations?.length > 0) {
        await tx.document.deleteMany({
          where: {
            id: {
              in: chat.documentRelations.map(r => r.documentId)
            }
          }
        })
      }

      await tx.chat.delete({
        where: { id }
      })
    })

    logger().info({
      msg: 'Chat and associated data deleted successfully',
      data: {
        chatId: id,
        userId: req.session.user.id,
        documentCount: chat.documentRelations?.length || 0
      }
    })

    return res.json({
      code: 0,
      data: {},
      msg: '删除成功'
    })

  } catch (err) {
    if (err instanceof AuthorizationError) {
      return res.status(403).json(createErrorResponse(403, err.message))
    }
    return handleError(err, req, res, 'delete chat')
  }
})

// Chat Round 创建路由
router.post('/round/create', authMiddleware, async (req, res) => {
  try {
    const validatedData = validateSchema(createChatRoundSchema, req.body, 'create chat round')
    if (!validatedData) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { chatId, question } = validatedData

    logger().info({
      msg: 'Attempting to create chat round',
      data: {
        chatId,
        userId: req.session.user.id
      }
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId: req.session.user.id
      }
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    const sanitizedQuestion = sanitizeInput(question)

    const chatRecord = await prisma().chatRecord.create({
      data: {
        chatId,
        question: sanitizedQuestion,
        answer: Buffer.from(''),
        speakerType: 'user'
      }
    })

    logger().info({
      msg: 'Chat round created successfully',
      data: {
        recordId: chatRecord.id,
        chatId,
        userId: req.session.user.id
      }
    })

    return res.json({
      code: 0,
      data: {
        id: chatRecord.id
      },
      msg: '创建成功'
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
router.post('/detail',
  authMiddleware,
  cacheMiddleware(CONFIG.CHAT_DETAIL_CACHE_DURATION),
  async (req, res) => {
    try {
      const validatedData = validateSchema(getChatDetailSchema, req.body, 'get chat detail')
      if (!validatedData) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { id } = validatedData
      const userId = req.session.user.id

      logger().info({
        msg: 'Attempting to get chat detail',
        data: { chatId: id, userId }
      })

      const chat = await prisma().chat.findFirst({
        where: {
          id,
          userId
        },
        select: {
          id: true,
          type: true,
          records: {
            orderBy: {
              createdTime: 'asc'
            },
            select: {
              id: true,
              question: true,
              speakerType: true,
              answer: true,
              createdTime: true
            }
          },
          documentRelations: {
            select: {
              document: {
                select: {
                  id: true,
                  title: true
                }
              }
            }
          },
          fileRelations: {
            select: {
              userFile: {
                select: {
                  fileId: true,
                  fileName: true
                }
              }
            }
          }
        }
      })

      if (!chat) {
        throw new AuthorizationError('聊天记录不存在或无权访问')
      }

      const messages = chat.records.flatMap(record => [
        {
          id: record.id,
          role: 'user',
          content: sanitizeInput(record.question)
        },
        {
          id: record.id,
          role: 'assistant',
          content: record.answer.toString()
        }
      ]);

      const responseData: ChatDetailResponse = {
        type: chat.type === 1 ? 'rag' : 'report',
        messages,
        documentId: null,
        file: null
      };

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
            type: fileRelation.userFile.fileName.split('.').pop() || ''
          }
        }
      }

      logger().info({
        msg: 'Chat detail retrieved successfully',
        data: {
          chatId: id,
          userId,
          type: responseData.type,
          messageCount: messages.length
        }
      })

      return res.json({
        code: 0,
        data: responseData,
        msg: '获取成功'
      })

    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      return handleError(err, req, res, 'get chat detail')
    }
  })

// Chat Completions 路由
router.get('/completions',
  authMiddleware,
  completionsLimiter,
  async (req, res) => {
    try {
      const validatedData = validateSchema(chatCompletionsSchema, req.query, 'chat completions')
      if (!validatedData) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { chatId, roundId } = validatedData

      validateEnvVars()

      const chatRecord = await prisma().chatRecord.findFirst({
        where: {
          id: roundId,
          chatId: chatId,
          chat: {
            userId: req.session.user.id
          }
        },
        select: {
          id: true,
          question: true,
          speakerType: true,
          chat: {
            select: {
              id: true
            }
          }
        }
      })

      if (!chatRecord) {
        throw new AuthorizationError('对话记录不存在或无权访问')
      }

      setupSSEConnection(res)

      const messages: Message[] = [{
        id: chatRecord.id,
        role: 'user',
        content: sanitizeInput(chatRecord.question)
      }]

      try {
        // 先打印请求参数日志
        logger().info({
          msg: 'Relation check request',
          data: {
            url: `${CONFIG.AI_AGENT_URL}/v1/ai/chat/relation`,
            requestBody: { messages },
            chatId,
            roundId,
            userId: req.session.user.id
          }
        })

        const relationCheckResponse = await fetchWithTimeout(
          `${CONFIG.AI_AGENT_URL}/v1/ai/chat/relation`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages })
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
            userId: req.session.user.id
          }
        })

        if (relationResult.code !== 0 || !relationResult.data.related) {
          logger().info({
            msg: 'Chat content not related',
            data: { roundId, chatId }
          })

          const errorMessage = [
            '```error',
            '暂时无法回答非相关内容',
            '```'
          ];

          // 更新 ChatRecord 状态为结束，并存储错误信息
          await prisma().chatRecord.update({
            where: { id: roundId },
            data: {
              status: CONFIG.CHAT_STATUS.COMPLETED, // 结束状态
              answer: Buffer.from(errorMessage.join('\n')),
              speakerType: 'assistant',
              updateTime: new Date()
            }
          })

          errorMessage.forEach(line => {
            res.write(`data: ${line}\n`);
          });
          res.write('\n'); // 表示该消息结束
          res.write(`data: [DONE]\n\n`)
          return
        }

        const response = await fetchWithTimeout(
          `${CONFIG.AI_AGENT_URL}/v1/ai/chat/data/completions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_input: chatRecord.question
            })
          },
          30000
        ) as FetchResponse

        if (!response.ok) {
          throw new Error(`AI 对话请求失败: ${response.status}`)
        }

        await handleStreamResponse(response, res, {
          type: 'chat_record',
          chatId: chatId,
          roundId: roundId
        })

      } catch (error) {
        logger().error({
          msg: 'AI service error',
          data: { error }
        })
        res.write(`data: [ERROR] ${error instanceof Error ? error.message : 'AI 服务暂时不可用'}\n\n`)
        res.write(`data: [DONE]\n\n`)
        res.end()
      }

    } catch (err) {
      if (err instanceof AuthorizationError) {
        res.write(`data: [ERROR] ${err.message}\n\n`)
        res.write(`data: [DONE]\n\n`)
        return res.end()
      }

      logger().error({
        msg: 'Failed to process chat completion',
        data: {
          error: err,
          errorMessage: err instanceof Error ? err.message : '未知错误',
          errorStack: err instanceof Error ? err.stack : undefined,
          requestQuery: req.query,
          userId: req.session?.user?.id
        }
      })

      res.write(`data: [ERROR] 服务器内部错误\n\n`)
      res.write(`data: [DONE]\n\n`)
      res.end()
    }
  })

// Chat 总结路由
router.get('/summarize',
  authMiddleware,
  summarizeLimiter,
  async (req, res) => {
    try {
      const validatedData = validateSchema(summarizeChatSchema, req.query, 'summarize chat')
      if (!validatedData) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { chatId, roundId } = validatedData

      validateEnvVars()

      const chatRecord = await prisma().chatRecord.findFirst({
        where: {
          id: roundId,
          chatId,
          chat: {
            userId: req.session.user.id
          }
        },
        select: {
          id: true,
          question: true,
          answer: true,
          speakerType: true
        }
      })

      if (!chatRecord) {
        throw new AuthorizationError('对话记录不存在或无权访问')
      }

      setupSSEConnection(res)

      try {
        const messages = [
          {
            id: chatRecord.id,
            role: 'user',
            content: sanitizeInput(chatRecord.question)
          },
          {
            id: chatRecord.id,
            role: 'assistant',
            content: chatRecord.answer.toString()
          }
        ]

        // 添加请求参数日志
        logger().info({
          msg: 'Summarize request parameters',
          data: {
            url: `${CONFIG.AI_AGENT_URL}/v1/ai/chat/summarize`,
            requestBody: {
              messages,
              temperature: 0
            },
            chatId,
            roundId,
            userId: req.session.user.id
          }
        })

        const response = await fetchWithTimeout(
          `${CONFIG.AI_AGENT_URL}/v1/ai/chat/summarize`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages,
              temperature: 0
            })
          },
          10000
        ) as FetchResponse

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
            userId: req.session.user.id
          }
        })

        await handleStreamResponse(response, res, {
          type: 'chat_title',
          chatId: chatId
        })

      } catch (error) {
        logger().error({
          msg: 'AI summarization error',
          data: { error }
        })
        res.write(`data: [ERROR] ${error instanceof Error ? error.message : 'AI 服务暂时不可用'}\n\n`)
        res.write(`data: [DONE]\n\n`)
        res.end()
      }

    } catch (err) {
      if (err instanceof AuthorizationError) {
        res.write(`data: [ERROR] ${err.message}\n\n`)
        res.write(`data: [DONE]\n\n`)
        return res.end()
      }

      logger().error({
        msg: 'Failed to process chat summarization',
        data: {
          error: err,
          errorMessage: err instanceof Error ? err.message : '未知错误',
          errorStack: err instanceof Error ? err.stack : undefined,
          requestQuery: req.query,
          userId: req.session?.user?.id
        }
      })

      res.write(`data: [ERROR] 服务器内部错误\n\n`)
      res.write(`data: [DONE]\n\n`)
      res.end()
    }
  })

// 初始化验证
validateEnvVars()

export default router
