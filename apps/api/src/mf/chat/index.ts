import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '@briefer/database'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../logger.js'
import { authenticationMiddleware } from '../../auth/token.js'
import { UserWorkspaceRole } from '@prisma/client'

class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

const router = Router({ mergeParams: true })

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

// 所有路由使用 authMiddleware
router.post('/create', authMiddleware, async (req, res) => {
  try {
    // 验证请求参数
    const result = createChatSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid create chat input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: null
      })
    }

    const { type, fileId } = result.data
    const chatId = uuidv4()

    logger().info({
      msg: 'Attempting to create chat',
      data: {
        type,
        fileId,
        userId: req.session.user.id
      }
    })

    // 开启事务
    const response = await prisma().$transaction<{ chatId: string; documentId: string | null }>(async (tx) => {
      // 创建聊天记录
      const chat = await tx.chat.create({
        data: {
          id: chatId,
          userId: req.session.user.id,
          title: type === 'rag' ? 'Untitled' : '新的报告',
          type: type === 'rag' ? 1 : 2
        }
      })

      // 如果是report类型，需要创建文档
      let documentId = null
      if (type === 'report') {
        if (!fileId) {
          throw new BusinessError('当生成报告时，文件ID不能为空');
        }

        // 检查文件是否存在且属于当前用户
        const userFile = await tx.userFile.findFirst({
          where: {
            fileId: fileId,
            createdUserId: req.session.user.id
          }
        });

        if (!userFile) {
          throw new BusinessError('文件不存在或无权访问');
        }

        // 创建文档
        const workspace = Object.values(req.session.userWorkspaces ?? {})[0];
        if (!workspace?.workspaceId) {
          throw new Error('No workspace found for user');
        }

        const doc = await tx.document.create({
          data: {
            id: uuidv4(),
            title: '新的报告',
            workspaceId: workspace.workspaceId,
            icon: 'DocumentIcon',
            orderIndex: -1
          }
        })
        documentId = doc.id

        // 创建对话和文档的关联
        await tx.chatDocumentRelation.create({
          data: {
            chatId: chat.id,
            documentId: doc.id
          }
        })

        // 创建对话和文件的关联
        await tx.chatFileRelation.create({
          data: {
            chatId: chat.id,
            fileId
          }
        })
      }

      return {
        chatId: chat.id,
        documentId
      }
    })

    logger().info({
      msg: 'Chat created successfully',
      data: {
        chatId: response.chatId,
        documentId: response.documentId,
        type,
        userId: req.session.user.id
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
    if (err instanceof BusinessError) {
      return res.status(400).json({
        code: 400,
        msg: err.message,
        data: null
      });
    }

    logger().error({
      msg: 'Failed to create chat',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        userId: req.session.user.id
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: null
    })
  }
})

// 获取聊天列表
router.get('/list', authMiddleware, async (req, res) => {
  try {
    logger().info({
      msg: 'Attempting to fetch chat list',
      data: {
        userId: req.session.user.id
      }
    })

    // 获取用户的所有对话，按创建时间倒序
    const chats = await prisma().chat.findMany({
      where: {
        userId: req.session.user.id
      },
      orderBy: {
        createdTime: 'desc'
      },
      include: {
        documentRelations: {
          select: {
            documentId: true
          }
        }
      }
    })

    // 转换数据格式
    const chatList = chats.map(chat => ({
      id: chat.id,
      documentId: chat.documentRelations[0]?.documentId || null,
      title: chat.title,
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
    logger().error({
      msg: 'Failed to fetch chat list',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        userId: req.session.user.id
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: {
        list: []
      }
    })
  }
})

// 更新对话标题
router.post('/update', authMiddleware, async (req, res) => {
  try {
    // 验证请求参数
    const result = updateChatSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid update chat title input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: {}
      })
    }

    const { id, title } = result.data

    logger().info({
      msg: 'Attempting to update chat title',
      data: {
        chatId: id,
        newTitle: title,
        userId: req.session.user.id
      }
    })

    // 查询对话是否存在且属于当前用户
    const chat = await prisma().chat.findFirst({
      where: {
        id,
        userId: req.session.user.id
      }
    })

    if (!chat) {
      logger().warn({
        msg: 'Chat not found or not owned by user',
        data: {
          chatId: id,
          userId: req.session.user.id
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '对话不存在或无权访问',
        data: {}
      })
    }

    // 更新对话标题
    await prisma().chat.update({
      where: {
        id
      },
      data: {
        title
      }
    })

    logger().info({
      msg: 'Chat title updated successfully',
      data: {
        chatId: id,
        newTitle: title,
        userId: req.session.user.id
      }
    })

    return res.json({
      code: 0,
      data: {},
      msg: '更新成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to update chat title',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        userId: req.session.user.id
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: {}
    })
  }
})

// 删除对话
router.post('/delete', authMiddleware, async (req, res) => {
  try {
    // 验证请求参数
    const result = deleteChatSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid delete chat input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: {}
      })
    }

    const { id } = result.data

    logger().info({
      msg: 'Attempting to delete chat',
      data: {
        chatId: id,
        userId: req.session.user.id
      }
    })

    // 查询对话是否存在且属于当前用户
    const chat = await prisma().chat.findFirst({
      where: {
        id,
        userId: req.session.user.id
      },
      include: {
        documentRelations: true // 包含文档关联信息
      }
    })

    if (!chat) {
      logger().warn({
        msg: 'Chat not found or not owned by user',
        data: {
          chatId: id,
          userId: req.session.user.id
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '对话不存在或无权访问',
        data: {}
      })
    }

    // 使用事务删除对话及其关联数据
    await prisma().$transaction(async (tx) => {
      // 1. 删除关联的文档
      if (chat.documentRelations && chat.documentRelations.length > 0) {
        logger().info({
          msg: 'Deleting associated documents',
          data: {
            chatId: id,
            documentIds: chat.documentRelations.map(r => r.documentId)
          }
        })

        await tx.document.deleteMany({
          where: {
            id: {
              in: chat.documentRelations.map(r => r.documentId)
            }
          }
        })
      }

      // 2. 删除对话(会自动级联删除 ChatDocumentRelation 和 ChatFileRelation)
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
    logger().error({
      msg: 'Failed to delete chat',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        userId: req.session.user.id
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: {}
    })
  }
})

// 创建聊天记录
router.post('/round/create', authMiddleware, async (req, res) => {
  try {
    // 验证请求参数
    const result = createChatRoundSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid create chat round input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: null
      })
    }

    const { chatId, question } = result.data

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
      logger().warn({
        msg: 'Chat not found or not owned by user',
        data: {
          chatId,
          userId: req.session.user.id
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '对话不存在或无权访问',
        data: null
      })
    }

    // 创建聊天记录
    const chatRecord = await prisma().chatRecord.create({
      data: {
        chatId,
        question,
        answer: Buffer.from(''), // 初始化为空buffer
        speakerType: 'user'  // 添加说话者类型
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
    logger().error({
      msg: 'Failed to create chat round',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        userId: req.session.user.id
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: null
    })
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

// 获取聊天详情
router.post('/detail', authMiddleware, async (req, res) => {
  try {
    // 验证请求参数
    const result = getChatDetailSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid get chat detail input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: null
      })
    }

    const { id } = result.data

    logger().info({
      msg: 'Attempting to get chat detail',
      data: {
        chatId: id,
        userId: req.session.user.id
      }
    })

    // 查询聊天记录及其关联信息
    const chat = await prisma().chat.findFirst({
      where: {
        id,
        userId: req.session.user.id
      },
      include: {
        records: {
          orderBy: {
            createdTime: 'asc'
          }
        },
        documentRelations: {
          include: {
            document: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },
        fileRelations: {
          include: {
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
      logger().warn({
        msg: 'Chat not found or not owned by user',
        data: {
          chatId: id,
          userId: req.session.user.id
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '聊天记录不存在或无权访问',
        data: null
      })
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

    // 如果是report类型，添加文档和文件信息
    if (chat.type === 2) {
      const documentRelation = chat.documentRelations[0]
      const fileRelation = chat.fileRelations[0]

      if (documentRelation?.document) {
        responseData.documentId = documentRelation.documentId
      }

      if (fileRelation?.userFile) {
        responseData.file = {
          id: fileRelation.userFile.fileId,
          name: fileRelation.userFile.fileName,
          type: fileRelation.userFile.fileName.split('.').pop() || ''
        }
      }
    }

    logger().info({
      msg: 'Chat detail retrieved successfully',
      data: {
        chatId: id,
        userId: req.session.user.id,
        type: responseData.type,
        hasDocument: !!responseData.documentId,
        hasFile: !!responseData.file
      }
    })

    return res.json({
      code: 0,
      data: responseData,
      msg: '获取成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to get chat detail',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        userId: req.session.user.id
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: null
    })
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

// 添加SSE对话接口
router.get('/completions', authMiddleware, async (req, res) => {
  try {
    // 验证请求参数
    const result = chatCompletionsSchema.safeParse(req.query)
    if (!result.success) {
      logger().error({
        msg: 'Invalid chat completions input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestQuery: req.query
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: null
      })
    }

    const { chatId, roundId } = result.data

    // 检查聊天记录是否存在且属于当前用户
    const chatRecord = await prisma().chatRecord.findFirst({
      where: {
        id: roundId,
        chatId: chatId,  // 添加chatId条件
        chat: {
          userId: req.session.user.id
        }
      },
      include: {
        chat: true  // 只包含chat基本信息，不再包含所有records
      }
    })

    if (!chatRecord) {
      logger().warn({
        msg: 'Chat record not found or not owned by user',
        data: {
          chatId,
          roundId,
          userId: req.session.user.id
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '对话记录不存在或无权访问',
        data: null
      })
    }

    // 添加 AI Agent URL 检查
    const aiAgentUrl = process.env["AI_AGENT_URL"]
    if (!aiAgentUrl) {
      throw new Error('AI_AGENT_URL environment variable is not set')
    }

    // 构造关联性检查的消息
    const messages: Message[] = [{
      id: chatRecord.id,
      role: chatRecord.speakerType,
      content: chatRecord.question
    }]

    const relationCheckUrl = `${aiAgentUrl}/v1/ai/chat/relation`
    const relationCheckBody = { messages }

    logger().info({
      msg: 'Calling relation check API',
      data: {
        url: relationCheckUrl,
        body: relationCheckBody,
        chatId,
        roundId
      }
    })

    // 设置SSE响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    // 发送连接成功消息
    res.write('event: connected\n');
    res.write('data: {"status": "success", "message": "SSE连接已建立"}\n\n');

    // 添加 timeout 和错误处理
    const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 10000) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        return response
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    }

    // 调用关联性检查接口
    try {
      const relationCheckResponse = await fetchWithTimeout(
        `${aiAgentUrl}/v1/ai/chat/relation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ messages })
        }
      )

      if (!relationCheckResponse.ok) {
        throw new Error(`关联性检查请求失败: ${relationCheckResponse.status}`)
      }

      const relationResult = await relationCheckResponse.json() as RelationCheckResponse

      if (relationResult.code !== 0 || !relationResult.data.related) {
        res.write(`data: [ERROR] 暂时无法回答非相关内容\n\n`)
        res.write(`data: [DONE]\n\n`)
        res.end()
        return
      }
    } catch (error) {
      logger().error({
        msg: 'Failed to check relation',
        data: { error }
      })
      res.write(`data: [ERROR] 关联性检查服务暂时不可用\n\n`)
      res.write(`data: [DONE]\n\n`)
      res.end()
      return
    }

    // 调用 AI Agent 对话接口
    try {
      const response = await fetchWithTimeout(
        `${aiAgentUrl}/v1/ai/chat/data/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_input: chatRecord.question
          })
        }
      )

      if (!response.ok) {
        throw new Error(`AI 对话请求失败: ${response.status}`)
      }

      // 处理SSE响应
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)

        // 添加非空检查，只发送非空消息
        const trimmedChunk = chunk.trim()
        if (trimmedChunk) {
          res.write(`data: ${trimmedChunk}\n\n`)

          // 如果收到结束标识，结束响应
          if (trimmedChunk.includes('[DONE]')) {
            res.end()
            break
          }
        }
      }

      logger().info({
        msg: 'Chat completion completed successfully',
        data: {
          chatId,
          roundId,
          userId: req.session.user.id
        }
      })

    } catch (error) {
      logger().error({
        msg: 'Failed to get AI completion',
        data: { error }
      })
      res.write(`data: [ERROR] AI 服务暂时不可用，请稍后重试\n\n`)
      res.write(`data: [DONE]\n\n`)
      res.end()
      return
    }

  } catch (err) {
    logger().error({
      msg: 'Failed to process chat completion',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestQuery: req.query,
        userId: req.session.user.id
      }
    })

    res.write(`data: [ERROR] 服务器内部错误\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }
})

export default router
