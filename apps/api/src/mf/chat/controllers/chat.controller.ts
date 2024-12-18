import { Request, Response } from 'express'
import { chatService } from '../services/chat.service.js'
import { createErrorResponse, withErrorHandler } from '../../../utils/validation.js'
import { ValidationError } from '../types/errors.js'
import { z } from 'zod'
import { IOServer } from '../../../websocket/index.js'
import {
  createChatSchema,
  updateChatSchema,
  deleteChatSchema,
  createChatRoundSchema,
  getChatDetailSchema,
  getChatStatusSchema,
  chatCompletionsSchema
} from '../types/schemas.js'
import { sendSuccess } from '../../../utils/response.js'
import { setupSSEConnection, sendSSEError } from '../utils/sse-utils.js'

/**
 * 聊天控制器
 */
export class ChatController {
  /**
   * 创建新的聊天会话
   * @param req Express请求对象，包含：
   *   - body.type: 聊天类型
   *   - body.fileId: 关联的文件ID（可选）
   *   - session.user.id: 用户ID
   *   - session.userWorkspaces: 用户的工作区信息
   * @param res Express响应对象
   * @returns 返回新创建的聊天会话信息
   * @throws {ValidationError} 当工作区ID无效时抛出
   */
  async createChat(req: Request, res: Response) {
    const result = createChatSchema.safeParse(req.body)
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
    return sendSuccess(res, response, '创建成功')
  }

  /**
   * 获取用户的聊天会话列表
   * @param req Express请求对象，包含session.user.id用户ID
   * @param res Express响应对象
   * @returns 返回用户的所有聊天会话列表
   */
  async getChatList(req: Request, res: Response) {
    const userId = req.session.user.id
    const chatList = await chatService.getChatList(userId)
    return sendSuccess(res, { list: chatList }, '获取成功')
  }

  /**
   * 更新聊天会话的标题
   * @param req Express请求对象，包含：
   *   - body.id: 聊天会话ID
   *   - body.title: 新的标题
   *   - session.user.id: 用户ID
   * @param res Express响应对象
   * @returns 返回更新成功的响应
   * @throws {AuthorizationError} 当用户无权限修改时抛出
   */
  async updateChat(req: Request, res: Response) {
    const result = updateChatSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { id, title } = result.data
    const userId = req.session.user.id

    await chatService.updateChat(userId, id, title)
    return sendSuccess(res, {}, '更新成功')
  }

  /**
   * 删除聊天会话
   * @param req Express请求对象，包含：
   *   - body.id: 要删除的聊天会话ID
   *   - session.user.id: 用户ID
   * @param res Express响应对象
   * @returns 返回删除成功的响应
   * @throws {AuthorizationError} 当用户无权限删除时抛出
   */
  async deleteChat(req: Request, res: Response) {
    const result = deleteChatSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { id } = result.data
    const userId = req.session.user.id

    await chatService.deleteChat(userId, id)
    return sendSuccess(res, {}, '删除成功')
  }

  /**
   * 创建新的聊天轮次
   * @param req Express请求对象，包含：
   *   - body.chatId: 聊天会话ID
   *   - body.question: 用户的问题
   *   - session.user.id: 用户ID
   * @param res Express响应对象
   * @returns 返回新创建的聊天轮次ID
   * @throws {AuthorizationError} 当用户无权限访问该聊天会话时抛出
   */
  async createChatRound(req: Request, res: Response) {
    const result = createChatRoundSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { chatId, question } = result.data
    const userId = req.session.user.id

    const { roundId } = await chatService.createChatRound(chatId, userId, question)
    return sendSuccess(res, { id: roundId }, '创建成功')
  }

  /**
   * 获取聊天会话的详细信息
   * @param req Express请求对象，包含：
   *   - body.id: 聊天会话ID
   *   - session.user.id: 用户ID
   * @param res Express响应对象
   * @returns 返回聊天会话的详细信息，包括所有对话记录
   * @throws {AuthorizationError} 当用户无权限访问时抛出
   */
  async getChatDetail(req: Request, res: Response) {
    const result = getChatDetailSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { id } = result.data
    const userId = req.session.user.id

    const chatDetail = await chatService.getChatDetail(userId, id)
    return sendSuccess(res, chatDetail, '获取成功')
  }

  /**
   * 获取聊天会话的当前状态
   * @param req Express请求对象，包含：
   *   - body.chatId: 聊天会话ID
   *   - session.user.id: 用户ID
   * @param res Express响应对象
   * @returns 返回聊天会话的当前状态和最新轮次ID
   * @throws {AuthorizationError} 当用户无权限访问时抛出
   */
  async getChatStatus(req: Request, res: Response) {
    const result = getChatStatusSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { chatId } = result.data
    const userId = req.session.user.id

    const statusResult = await chatService.getChatStatus(userId, chatId)

    return sendSuccess(res, statusResult, '获取成功')
  }

  /**
   * 停止正在进行的聊天
   * @param req Express请求对象，包含：
   *   - body.roundId: 聊天轮次ID
   *   - session.user.id: 用户ID
   * @param res Express响应对象
   * @returns 返回停止成功的响应
   * @throws {AuthorizationError} 当用户无权限操作时抛出
   */
  async stopChat(req: Request, res: Response) {
    const schema = z.object({
      roundId: z.string(),
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json(createErrorResponse(400, '参数校验失败'))
    }

    const { roundId } = result.data
    const userId = req.session.user.id

    await chatService.stopChat(roundId, userId)
    return sendSuccess(res, {}, '停止成功')
  }

  /**
   * 更新聊天标题（使用SSE连接）
   * @param req Express请求对象，包含session.user.id用户ID
   * @param res Express响应对象
   * @throws {AuthorizationError} 当用户无权限时抛出
   * @throws {ValidationError} 当请求参数无效时抛出
   */
  async updateTitle(req: Request, res: Response) {
    const userId = req.session.user.id
    setupSSEConnection(res)
    await chatService.updateTitle(userId, req, res)
  }

  /**
   * 处理聊天补全请求（使用SSE连接）
   * @param req Express请求对象，包含：
   *   - query.chatId: 聊天会话ID
   *   - query.roundId: 聊天轮次ID
   *   - session.user.id: 用户ID
   * @param res Express响应对象
   * @param socketServer WebSocket服务器实例
   * @throws {ValidationError} 当请求参数无效时抛出
   * @throws {AuthorizationError} 当用户无权限时抛出
   */
  async handleChatCompletions(req: Request, res: Response, socketServer: IOServer) {
    setupSSEConnection(res)

    const result = chatCompletionsSchema.safeParse(req.query)
    if (!result.success) {
      await sendSSEError(res, new ValidationError('参数校验失败'), {
        type: 'chat_record',
        id: '',
        chatId: req.query['chatId'] as string,
        roundId: req.query['roundId'] as string,
      })
      return
    }

    const { chatId, roundId } = result.data
    const userId = req.session.user.id

    await chatService.handleChatCompletions(req, res, chatId, roundId, userId, socketServer)
  }
}

// 使用withErrorHandler包装所有方法
export const chatController = new ChatController()
const methodNames = Object.getOwnPropertyNames(ChatController.prototype)
  .filter(prop => prop !== 'constructor') as Array<keyof ChatController>

methodNames.forEach(methodName => {
  const originalMethod = (chatController[methodName] as Function).bind(chatController)
    ; (chatController[methodName] as any) = withErrorHandler(originalMethod, methodName)
})