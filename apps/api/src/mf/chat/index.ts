import { Router } from 'express'
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

// 创建聊天
router.post('/create', authenticationMiddleware, async (req, res) => {
  // router.post('/create', (req, res, next) => {
  //   // 验证请求参数
  //   const result = createChatSchema.safeParse(req.body)
  //   if (!result.success) {
  //     return res.status(400).json({
  //       code: 400,
  //       msg: result.error.errors[0]?.message || '参数校验失败',
  //       data: null
  //     })
  //   }

  //   // 添加测试用户数据
  //   req.session = {
  //     user: {
  //       id: 'test-user-id-123',
  //       status: 1,
  //       name: 'Test User',
  //       email: 'test@example.com',
  //       picture: '',
  //       phone: '',
  //       nickname: '',
  //       createdAt: new Date(),
  //       updatedAt: new Date(),
  //     },
  //     userWorkspaces: {
  //       default: {
  //         workspaceId: '71610da1-8c99-4274-b09f-711d70e2a247',
  //         userId: 'test-user-id',
  //         createdAt: new Date(),
  //         updatedAt: new Date(),
  //         inviterId: null,
  //         role: UserWorkspaceRole.admin
  //       }
  //     }
  //   }
  //   next()
  // }, async (req, res) => {
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
          title: type === 'rag' ? '新的对话' : '新的报告',
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

export default router
