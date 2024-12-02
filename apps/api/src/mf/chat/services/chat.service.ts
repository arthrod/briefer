import { prisma, createDocument } from '@briefer/database'
import { v4 as uuidv4 } from 'uuid'
import { CONFIG } from '../config/constants.js'
import { sanitizeInput, formatDate } from '../utils/format.js'
import { logger } from '../../../logger.js'
import { Response } from 'express'
import { AuthorizationError, ValidationError } from '../types/errors.js'
import fs from 'fs/promises'
import { UpdateTarget } from '../types/interfaces.js'
import { handleStreamResponse } from '../utils/sse.js'
import { fetchWithTimeout } from '../utils/fetch.js'

export class ChatService {
  
  async createChat(userId: string, type: 'rag' | 'report', fileId: string, workspaceId: string) {
    logger().info({
      msg: 'Attempting to create chat',
      data: { type, fileId, userId },
    })

    const chatId = uuidv4()
    const title = sanitizeInput(type === 'rag' ? 'Untitled' : '新的报告')

    if (type === 'report' && fileId) {
      const userFile = await prisma().userFile.findFirst({
        where: {
          fileId,
          createdUserId: userId,
        },
      })

      if (!userFile) {
        throw new AuthorizationError('文件不存在或无权访问')
      }
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

      // 创建初始问答记录
      const recordId = uuidv4()
      const chatRecord = await tx.chatRecord.create({
        data: {
          id: recordId,
          chatId: chat.id,
          roundId: recordId,
          question: '',
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
        const doc = await createDocument(workspaceId, {
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
        workspaceId,
      }
    })

    logger().info({
      msg: 'Chat created successfully',
      data: response,
    })

    return response
  }

  async getChatList(userId: string) {
    logger().info({
      msg: 'Attempting to fetch chat list',
      data: { userId },
    })

    const chats = await prisma().chat.findMany({
      where: {
        userId: userId,
      },
      select: {
        id: true,
        documentRelations: {
          select: {
            documentId: true,
          },
        },
        title: true,
        type: true,
        createdTime: true,
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
        userId,
        count: chatList.length,
      },
    })

    return chatList
  }

  async updateChat(userId: string, chatId: string, title: string) {
    logger().info({
      msg: 'Attempting to update chat title',
      data: {
        chatId,
        newTitle: title,
        userId,
      },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    const sanitizedTitle = sanitizeInput(title)

    await prisma().chat.update({
      where: { id: chatId },
      data: { title: sanitizedTitle },
    })

    logger().info({
      msg: 'Chat title updated successfully',
      data: {
        chatId,
        newTitle: sanitizedTitle,
        userId,
      },
    })
  }

  async deleteChat(userId: string, chatId: string) {
    logger().info({
      msg: 'Attempting to delete chat',
      data: {
        chatId,
        userId,
      },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权限删除')
    }

    let filesToDelete: { fileId: string; filePath: string }[] = []

    await prisma().$transaction(async (tx) => {
      // 获取关联的文件信息
      const fileRelations = await tx.chatFileRelation.findMany({
        where: { chatId },
        include: {
          userFile: true,
        },
      })
      filesToDelete = fileRelations.map((relation) => ({
        fileId: relation.userFile.fileId,
        filePath: relation.userFile.filePath,
      }))

      // 删除聊天记录
      await tx.chatRecord.deleteMany({
        where: { chatId },
      })

      // 删除文档关联
      await tx.chatDocumentRelation.deleteMany({
        where: { chatId },
      })

      // 删除文件关联
      await tx.chatFileRelation.deleteMany({
        where: { chatId },
      })

      // 删除聊天
      await tx.chat.delete({
        where: { id: chatId },
      })
    })

    // 删除物理文件
    for (const file of filesToDelete) {
      try {
        await fs.unlink(file.filePath)
      } catch (error) {
        logger().error('Failed to delete file:', {
          error,
          filePath: file.filePath,
        })
      }
    }

    logger().info({
      msg: 'Chat deleted successfully',
      data: {
        chatId,
        userId,
        deletedFiles: filesToDelete.length,
      },
    })
  }

  async createChatRound(chatId: string, userId: string, question: string) {
    // 验证聊天是否存在且属于当前用户
    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
      include: {
        fileRelations: {
          include: {
            userFile: true,
          },
        },
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    const roundId = uuidv4()
    const recordId = uuidv4()

    // 创建聊天记录
    await prisma().chatRecord.create({
      data: {
        id: recordId,
        chatId,
        roundId,
        question,
        answer: Buffer.from(''),
        speakerType: 'user',
        status: CONFIG.CHAT_STATUS.START,
      },
    })

    return {
      roundId,
      recordId,
    }
  }

  async handleChatCompletion(
    res: Response,
    chatId: string,
    roundId: string,
    recordId: string,
    question: string,
    type: 'rag' | 'report'
  ) {
    const updateTarget: UpdateTarget = {
      type: 'chat_record',
      chatId,
      roundId,
    }

    try {
      const endpoint = type === 'rag'
        ? CONFIG.AI_AGENT_ENDPOINTS.DATA_COMPLETIONS
        : CONFIG.AI_AGENT_ENDPOINTS.REPORT_COMPLETIONS

      const response = await fetchWithTimeout(
        `${CONFIG.AI_AGENT_URL}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId,
            roundId,
            recordId,
            question,
          }),
        },
        CONFIG.AI_AGENT_TIMEOUT
      )

      if (!response.ok) {
        throw new Error(`AI Agent request failed with status ${response.status}`)
      }

      await handleStreamResponse(response, res, updateTarget)
    } catch (error) {
      logger().error('Chat completion error:', {
        error,
        chatId,
        roundId,
      })
      throw error
    }
  }

  async getChatDetail(userId: string, chatId: string) {
    logger().info({
      msg: 'Attempting to fetch chat detail',
      data: { chatId, userId },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
      include: {
        fileRelations: {
          include: {
            userFile: true,
          },
        },
        records: {
          orderBy: {
            createdTime: 'asc',
          },
          select: {
            id: true,
            speakerType: true,
            question: true,
            answer: true,
          },
        },
        documentRelations: {
          select: {
            documentId: true,
          },
        },
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    const messages = chat.records.map((record) => ({
      id: record.id,
      role: record.speakerType,
      content: record.speakerType === 'user' ? record.question : record.answer.toString(),
    }))

    const file = chat.fileRelations[0]?.userFile
      ? {
          id: chat.fileRelations[0].userFile.id,
          name: chat.fileRelations[0].userFile.fileName,
          type: chat.fileRelations[0].userFile.fileId.split('.').pop() || '',
        }
      : null

    const response = {
      type: chat.type === 1 ? 'rag' : 'report',
      messages,
      documentId: chat.documentRelations[0]?.documentId || null,
      file,
    }

    logger().info({
      msg: 'Chat detail fetched successfully',
      data: {
        chatId,
        userId,
        messageCount: messages.length,
      },
    })

    return response
  }

  async checkRelation(question: string, fileId: string) {
    logger().info({
      msg: 'Checking relation between question and file',
      data: { question, fileId },
    })

    try {
      const response = await fetchWithTimeout(
        `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.RELATION_CHECK}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question,
            fileId,
          }),
        },
        CONFIG.AI_AGENT_TIMEOUT
      )

      if (!response.ok) {
        throw new Error(`AI Agent request failed with status ${response.status}`)
      }

      const result = await response.json() as { data: { related: any } }
      return result.data.related
    } catch (error) {
      logger().error('Relation check error:', {
        error,
        question,
        fileId,
      })
      throw error
    }
  }

  async getChatStatus(userId: string, chatId: string) {
    logger().info({
      msg: 'Attempting to get chat status',
      data: { chatId, userId },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
      include: {
        records: {
          orderBy: {
            createdTime: 'desc',
          },
          take: 1,
          select: {
            status: true,
          },
        },
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    const status = chat.records[0]?.status || CONFIG.CHAT_STATUS.COMPLETED

    logger().info({
      msg: 'Chat status fetched successfully',
      data: {
        chatId,
        userId,
        status,
      },
    })

    return status
  }

  async stopChat(userId: string, roundId: string) {
    logger().info({
      msg: 'Attempting to stop chat',
      data: { roundId, userId },
    })

    const record = await prisma().chatRecord.findFirst({
      where: {
        roundId,
        chat: {
          userId,
        },
      },
    })

    if (!record) {
      throw new AuthorizationError('聊天记录不存在或无权访问')
    }

    await prisma().chatRecord.update({
      where: {
        id: record.id,
      },
      data: {
        status: CONFIG.CHAT_STATUS.COMPLETED,
      },
    })

    logger().info({
      msg: 'Chat stopped successfully',
      data: {
        roundId,
        userId,
      },
    })
  }

  async updateTitle(res: Response, chatId: string, roundId: string, userId: string) {
    logger().info({
      msg: 'Attempting to update chat title',
      data: { chatId, roundId, userId },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
      include: {
        records: {
          where: {
            roundId,
          },
          select: {
            question: true,
          },
        },
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    const question = chat.records[0]?.question
    if (!question) {
      throw new ValidationError('未找到相关问题')
    }

    const updateTarget: UpdateTarget = {
      type: 'chat_title',
      chatId,
      roundId,
    }

    try {
      const response = await fetchWithTimeout(
        `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.SUMMARIZE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId,
            roundId,
            question,
          }),
        },
        CONFIG.AI_AGENT_TIMEOUT
      )

      if (!response.ok) {
        throw new Error(`AI Agent request failed with status ${response.status}`)
      }

      await handleStreamResponse(response, res, updateTarget)
    } catch (error) {
      logger().error('Title update error:', {
        error,
        chatId,
        roundId,
      })
      throw error
    }
  }
}

export const chatService = new ChatService()