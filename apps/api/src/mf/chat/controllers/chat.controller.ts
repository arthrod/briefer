import { Request, Response } from 'express'
import { chatService } from '../services/chat.service.js'
import { createErrorResponse, handleError } from '../utils/validation.js'
import { AuthorizationError, ValidationError } from '../types/errors.js'
import { z } from 'zod'
import { sendSSEError, setupSSEConnection } from '../utils/sse.js'
import { IOServer } from '../../../websocket/index.js'

export class ChatController {

  async createChat(req: Request, res: Response) {
    try {
      const schema = z.object({
        type: z.enum(['rag', 'report']),
        fileId: z.string(),
      })

      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { type, fileId } = result.data
      const userId = req.session.user.id
      const workspace = Object.values(req.session.userWorkspaces ?? {})[0]

      if (!workspace?.workspaceId) {
        throw new ValidationError('未找到有效的工作区')
      }

      const response = await chatService.createChat(userId, type, fileId, workspace.workspaceId)

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

  async getChatList(req: Request, res: Response) {
    try {
      const userId = req.session.user.id
      const chatList = await chatService.getChatList(userId)

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
  }

  async updateChat(req: Request, res: Response) {
    try {
      const schema = z.object({
        id: z.string(),
        title: z.string(),
      })

      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { id, title } = result.data
      const userId = req.session.user.id

      await chatService.updateChat(userId, id, title)

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
  }

  async deleteChat(req: Request, res: Response) {
    try {
      const schema = z.object({
        id: z.string(),
      })

      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { id } = result.data
      const userId = req.session.user.id

      await chatService.deleteChat(userId, id)

      return res.json({
        code: 0,
        data: {},
        msg: '删除成功',
      })
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      return handleError(err, req, res, 'delete chat')
    }
  }

  async createChatRound(req: Request, res: Response) {
    try {
      const schema = z.object({
        chatId: z.string(),
        question: z.string()
      })

      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { chatId, question } = result.data
      const userId = req.session.user.id

      try {
        const { roundId } = await chatService.createChatRound(chatId, userId, question)
        return res.json({
          code: 0,
          data: {
            id: roundId,
          },
          msg: '创建成功',
        })
      } catch (error) {
        return handleError(error, req, res, 'create chat round')
      }
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      if (err instanceof ValidationError) {
        return res.status(400).json(createErrorResponse(400, err.message))
      }
      return handleError(err, req, res, 'create chat round')
    }
  }

  async getChatDetail(req: Request, res: Response) {
    try {
      const schema = z.object({
        id: z.string(),
      })

      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { id } = result.data
      const userId = req.session.user.id

      const chatDetail = await chatService.getChatDetail(userId, id)

      return res.json({
        code: 0,
        data: chatDetail,
        msg: '获取成功',
      })
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      return handleError(err, req, res, 'get chat detail')
    }
  }

  async checkRelation(req: Request, res: Response) {
    try {
      const schema = z.object({
        question: z.string(),
        fileId: z.string(),
      })

      const result = schema.safeParse(req.query)
      if (!result.success) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { question, fileId } = result.data
      const related = await chatService.checkRelation(question, fileId)

      return res.json({
        code: 0,
        data: { related },
        msg: '检查成功',
      })
    } catch (err) {
      return handleError(err, req, res, 'check relation')
    }
  }

  async getChatStatus(req: Request, res: Response) {
    try {
      const schema = z.object({
        chatId: z.string(),
      })

      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const { chatId } = result.data
      const userId = req.session.user.id

      const { status, roundId } = await chatService.getChatStatus(userId, chatId)

      return res.json({
        code: 0,
        data: { status, roundId },
        msg: '获取成功',
      })
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      return handleError(err, req, res, 'get chat status')
    }
  }

  async stopChat(req: Request, res: Response) {
    try {
      const schema = z.object({
        roundId: z.string(),
      })

      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json(createErrorResponse(400, '参数校验失败'))
      }

      const {roundId } = result.data
      const userId = req.session.user.id

      await chatService.stopChat(roundId, userId)

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
  }

  async updateTitle(req: Request, res: Response) {
    try {
      const userId = req.session.user.id

      setupSSEConnection(res)

      try {
        await chatService.updateTitle(userId, req, res)
      } catch (error) {
        return handleError(error, req, res, 'update title')
      }
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      if (err instanceof ValidationError) {
        return res.status(400).json(createErrorResponse(400, err.message))
      }
      return handleError(err, req, res, 'update title')
    }
  }

  async handleChatCompletions(req: Request, res: Response, socketServer: IOServer) {
    // 在路由开始就建立 SSE 连接
    setupSSEConnection(res)

    try {
      const schema = z.object({
        chatId: z.string(),
        roundId: z.string(),
      })

      const result = schema.safeParse(req.query)
      if (!result.success) {
        await sendSSEError(res, new ValidationError('参数校验失败'), {
          type: 'chat_record',
          chatId: req.query['chatId'] as string,
          roundId: req.query['roundId'] as string,
        })
        return
      }

      const { chatId, roundId } = result.data
      const userId = req.session.user.id

      try {
        await chatService.handleChatCompletions(req, res, chatId, roundId, userId, socketServer)
      } catch (error) {
        return handleError(error, req, res, 'chat completions')
      }
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      if (err instanceof ValidationError) {
        return res.status(400).json(createErrorResponse(400, err.message))
      }
      return handleError(err, req, res, 'chat completions')
    }
  }
}

export const chatController = new ChatController()