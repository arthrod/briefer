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
import { ReadableStream } from 'stream/web'

// 错误类型定义
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

const router = Router({ mergeParams: true })

// 1. 添加请求速率限制
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100 // 限制每个IP 100个请求
})

router.use(apiLimiter)

// 2. 添加输入数据清理
const sanitizeInput = (input: string): string => {
  if (!input) return ''

  // 移除 HTML 标签
  input = input.replace(/<[^>]*>/g, '')

  // 移除特殊字符
  input = input.replace(/[<>'"]/g, '')

  // 移除控制字符
  input = input.replace(/[\x00-\x1F\x7F]/g, '')

  // 修剪空白字符
  return input.trim()
}

// 3. 环境变量验证
const validateEnvVars = () => {
  const requiredEnvVars = ['AI_AGENT_URL']
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
}

// 定义请求参数验证schema
const createChatSchema = z.object({
  type: z.enum(['rag', 'report']),
  fileId: z.string()
})

// 定义更新标题请求参数验证schema
const updateChatSchema = z.object({
  id: z.string().min(1, "对话ID不能为空"),
  title: z.string().min(1, "标题不能为空"),
})

// 定义删除对话请求参数验证schema
const deleteChatSchema = z.object({
  id: z.string().min(1, "对话ID不能为空"),
})

// 添加时间格式化辅助函数
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// 定义请求参数验证schema
const createChatRoundSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  chatId: z.string().min(1, "聊天ID不能为空"),
})

// 在文件顶部添加一个测试模式开关
const USE_TEST_AUTH = true; // 改为 false 时使用正常认证，true 时使用测试数据

// 创建通用的认证中间件
const authMiddleware = USE_TEST_AUTH
  ? ((req: Request, res: Response, next: NextFunction) => {
    req.session = getMockSession();
    next();
  })
  : authenticationMiddleware;

// 添加测试用户数据辅助函数，请修改成数据库中的已有数据
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

// 1. 提取共用的错误处理逻辑
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

// 2. 提取共用的参数证逻辑
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

// 1. 添加缓存中间件
interface CachedResponse {
  code: number
  data: unknown
  msg: string
}

interface ExtendedResponse extends Response {
  sendResponse: Send<any, Response>
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      AI_AGENT_URL: string
    }
  }
}

// 工具函数
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

// 缓存中间件
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

// 环境变量
const AI_AGENT_URL = process.env['AI_AGENT_URL']

// 处理流式响应
async function handleStreamResponse(
  response: FetchResponse,
  res: Response
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is empty')
  }

  const reader = (response.body as unknown as ReadableStream).getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  let buffer = ''
  const textDecoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += textDecoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        if (trimmedLine.startsWith('data:')) {
          const data = trimmedLine.slice(5).trim()

          if (data.includes('[DONE]')) {
            res.write(`data: [DONE]\n\n`)
            res.end()
          }

          res.write(`data: ${data}\n\n`)
        }
      }
    }

    if (buffer.trim()) {
      const data = buffer.trim()
      if (data.startsWith('data:')) {
        const content = data.slice(5).trim()
        if (content) {
          res.write(`data: ${content}\n\n`)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// 2. 优化数据库查询
const getChatWithRelations = async (chatId: string, userId: string) => {
  return await prisma().chat.findFirst({
    where: {
      id: chatId,
      userId
    },
    select: {
      id: true,
      type: true,
      documentRelations: {
        select: {
          documentId: true
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
}

// 创建聊天的速率限制器
const createChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 20 // 限制每个IP 20个请求
})

router.post('/create', authMiddleware, createChatLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = validateSchema(createChatSchema, req.body, 'create chat')
    if (!validatedData) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { type, fileId } = validatedData
    const chatId = uuidv4()
    const userId = req.session.user.id

    logger().info({
      msg: 'Attempting to create chat',
      data: { type, fileId, userId }
    })

    // 开启事务前检查文件权限
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

    // 获取用户工作区并确保存在
    const workspace = Object.values(req.session.userWorkspaces ?? {})[0]
    if (!workspace?.workspaceId) {
      throw new ValidationError('未找到有效的工作区')
    }

    // 开启事务
    const response = await prisma().$transaction(async (tx) => {
      // 创建聊天记录
      const chat = await tx.chat.create({
        data: {
          id: chatId,
          userId,
          title: sanitizeInput(type === 'rag' ? 'Untitled' : '新的报告'),
          type: type === 'rag' ? 1 : 2
        }
      })

      // 如果是report类型，创建相关资源
      let documentId = null
      if (type === 'report') {
        // 创建文档
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

        // 创建关联关系
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

      return { chatId: chat.id, documentId }
    }, {
      timeout: 5000 // 设置事务超时时间
    })

    logger().info({
      msg: 'Chat created successfully',
      data: {
        chatId: response.chatId,
        documentId: response.documentId,
        type,
        userId
      }
    })

    return res.json({
      code: 0,
      data: {
        id: response.chatId,
        documentId: response.documentId
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

// 获取聊天列表
router.get('/list', authMiddleware, cacheMiddleware(60), async (req, res) => {
  try {
    logger().info({
      msg: 'Attempting to fetch chat list',
      data: {
        userId: req.session.user.id
      }
    })

    // 优化查询,只获取必要字段
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

// 更新对话标题
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

    // 查询话是否存在且属于当前用户
    const chat = await prisma().chat.findFirst({
      where: {
        id,
        userId: req.session.user.id
      }
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    // 清理输入数据
    const sanitizedTitle = sanitizeInput(title)

    // 更新对话标题
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

// 删除对话
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

    // 使用优化后的查询,只获取必要字段
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

    // 使用事务删除对话及其关联数据
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

// 创建聊天记录
router.post('/round/create', authMiddleware, async (req, res) => {
  try {
    // 使用提取的验证逻辑
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

    // 检查聊天是否存在且属于当前用户
    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId: req.session.user.id
      }
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    // 清理输入数据
    const sanitizedQuestion = sanitizeInput(question)

    // 创建聊天记录
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

    // 使用通用错误处理
    return handleError(err, req, res, 'create chat round')
  }
})

// 定义文件信息接口
interface FileInfo {
  id: string
  name: string
  type: string
}

// 定义响应数据接口
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

const getChatDetailSchema = z.object({
  id: z.string().min(1, "聊天ID不能为空"),
})

// 获取聊天详情的缓存时间(秒)
const CHAT_DETAIL_CACHE_DURATION = 60

router.post('/detail',
  authMiddleware,
  cacheMiddleware(CHAT_DETAIL_CACHE_DURATION),
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

      // 优化查询,只获取必要字段
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

      // 转换消息格式
      const messages = chat.records.map(record => ({
        id: record.id,
        role: record.speakerType.toLowerCase(),
        content: record.answer.toString()
      }))

      // 构造返回数据
      const responseData: ChatDetailResponse = {
        type: chat.type === 1 ? 'rag' : 'report',
        messages,
        documentId: null,
        file: null
      }

      // 处理report类型的额外数据
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

// 定义请求参数验证schema
const chatCompletionsSchema = z.object({
  chatId: z.string().min(1, "对话ID不能为空"),
  roundId: z.string().min(1, "对话轮次ID不能为空"),
})

// 定义消息类型
interface Message {
  id: string
  role: string
  content: string
}

// 定义关联性检查响应类型
interface RelationCheckResponse {
  code: number
  msg: string
  data: {
    related: boolean
  }
}

// 创建对话补全的速率限制器
const completionsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10 // 限制每个IP 10个请求
})

// 添加SSE对话接口
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

      // 验证环变量
      validateEnvVars()

      // 优化查询
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

      // 设置SSE响应头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })

      // 发送连接成功消息
      res.write('event: connected\n')
      res.write('data: {"status": "success", "message": "SSE连接已建立"}\n\n')

      // 构造消息
      const messages: Message[] = [{
        id: chatRecord.id,
        role: chatRecord.speakerType,
        content: sanitizeInput(chatRecord.question)
      }]

      try {
        // 关联性检查
        const relationCheckResponse = await fetchWithTimeout(
          `${AI_AGENT_URL}/v1/ai/chat/relation`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages })
          },
          5000 // 5秒超时
        )

        if (!relationCheckResponse.ok) {
          throw new Error(`关联性检查请求失败: ${relationCheckResponse.status}`)
        }

        const relationResult = (await relationCheckResponse.json()) as RelationCheckResponse
        if (relationResult.code !== 0 || !relationResult.data.related) {
          res.write(`data: [ERROR] 暂时无法回答非相关内容\n\n`)
          res.write(`data: [DONE]\n\n`)
          return res.end()
        }

        // AI 对话请求
        const response = await fetchWithTimeout(
          `${AI_AGENT_URL}/v1/ai/chat/data/completions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_input: chatRecord.question
            })
          },
          30000 // 30秒超时
        ) as FetchResponse

        if (!response.ok) {
          throw new Error(`AI 对话请求失败: ${response.status}`)
        }

        // 处理流式响应
        await handleStreamResponse(response, res)

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


const summarizeChatSchema = z.object({
  chatId: z.string().min(1, "对话ID不能为空"),
  roundId: z.string().min(1, "对话轮次ID不能为空"),
})

// 总结对话的速率限制器
const summarizeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10 // 限制每个IP 10个请求
})

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

      // 验证环境变量
      validateEnvVars()

      // 优化查询
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
          speakerType: true
        }
      })

      if (!chatRecord) {
        throw new AuthorizationError('对话记录不存在或无权访问')
      }

      // 设置SSE响应头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })

      res.write('event: connected\n')
      res.write('data: {"status": "success", "message": "SSE连接已建立"}\n\n')

      try {
        const response = await fetchWithTimeout(
          `${AI_AGENT_URL}/v1/ai/chat/summarize`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{
                id: chatRecord.id,
                role: chatRecord.speakerType,
                content: sanitizeInput(chatRecord.question)
              }],
              temperature: 0
            })
          },
          10000 // 10秒超时
        ) as FetchResponse

        if (!response.ok) {
          throw new Error(`AI 总结请求失败: ${response.status}`)
        }

        await handleStreamResponse(response, res)

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

// 2. 统一错误响应格式
interface ErrorResponse {
  code: number
  msg: string
  data: null
}

const createErrorResponse = (code: number, message: string): ErrorResponse => ({
  code,
  msg: message,
  data: null
})

// 在应用初始化时调用
validateEnvVars()

export default router
