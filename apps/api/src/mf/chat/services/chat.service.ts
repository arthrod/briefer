import { Response } from 'express'
import { prisma, createDocument } from '@briefer/database'
import { ChatSpeakerType } from '@prisma/client'
import { AuthorizationError, ValidationError } from '../types/errors.js'
import { fetchWithTimeout } from '../utils/fetch.js'
import { CONFIG } from '../config/constants.js'
import { logger } from '../../../logger.js'
import { handleStreamResponse } from '../utils/sse.js'
import { Message, RelationCheckResponse, UpdateTarget } from '../types/interfaces.js'
import * as fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { sanitizeInput, formatDate } from '../utils/format.js'

// 聊天记录状态枚举
export enum ChatRecordStatus {
  START = 1,      // 开始
  PROCESSING = 2, // 聊天中
  COMPLETED = 3,  // 结束
  ERROR = 4,      // 失败
  STOPPED = 5,    // 已停止
  PENDING = 6,    // 等待
}

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
          speakerType: ChatSpeakerType.user,
          status: ChatRecordStatus.START,
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
    logger().info({
      msg: 'Creating chat round',
      data: { chatId, userId, question },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
      include: {
        fileRelations: {
          select: {
            userFile: {
              select: {
                fileId: true,
              },
            },
          },
        },
      },
    })

    if (!chat) {
      throw new AuthorizationError('对话不存在或无权访问')
    }

    // 检查问题与文档内容的关联性
    if (chat.type !== 2) { // 非报告类型需要检查关联性
      const fileId = chat.fileRelations[0]?.userFile?.fileId
      if (!fileId) {
        throw new ValidationError('未找到关联的文件')
      }

      const isRelated = await this.checkRelation(chatId, question)
      if (!isRelated) {
        throw new ValidationError('问题与文档内容无关，请重新提问')
      }
    }

    // 生成轮次 ID
    const roundId = uuidv4()

    // 创建聊天记录
    const record = await prisma().chatRecord.create({
      data: {
        id: uuidv4(),
        chatId,
        roundId,
        question,
        answer: Buffer.from(''),
        speakerType: ChatSpeakerType.user,
        status: ChatRecordStatus.PENDING,
        createdTime: new Date(),
        updateTime: new Date(),
      },
    })

    logger().info({
      msg: 'Chat round created successfully',
      data: {
        chatId,
        roundId,
        recordId: record.id,
      },
    })

    return {
      roundId,
      recordId: record.id,
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
    logger().info({
      msg: 'Handling chat completion',
      data: { chatId, roundId, recordId, type },
    })

    const updateTarget: UpdateTarget = {
      type: 'chat_record',
      chatId,
      roundId,
    }

    try {
      if (type === 'report') {
        // 获取关联的文件
        const chatRecord = await prisma().chat.findFirst({
          where: {
            id: chatId,
          },
          select: {
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
        })

        const fileRelation = chatRecord?.fileRelations[0]
        if (!fileRelation?.userFile) {
          throw new ValidationError('未找到关联的文件')
        }

        const userFile = fileRelation.userFile
        const fileContent = await fs.readFile(userFile.filePath, 'utf8')

        // 构建请求体
        const formData = new FormData()
        formData.append('user_input', question)
        formData.append('docx_report', new Blob([fileContent]), userFile.fileName)

        // 调用AI Agent接口
        logger().info({
          msg: 'Sending report request to AI Agent',
          data: {
            url: `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.REPORT_COMPLETIONS}`,
            timeout: CONFIG.AI_AGENT_TIMEOUT,
            filename: userFile.fileName,
            question,
          }
        })

        const response = await fetchWithTimeout(
          `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.REPORT_COMPLETIONS}`,
          {
            method: 'POST',
            body: formData,
            headers: {
              'Accept': 'text/event-stream'
            }
          },
          60000  // 增加超时时间到 60 秒
        )

        if (!response.ok) {
          throw new Error(`AI 报告对话请求失败: ${response.status}`)
        }

        await handleStreamResponse(response, res, updateTarget)
      } else {
        // 调用 AI Agent 进行对话
        const response = await fetchWithTimeout(
          `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.DATA_COMPLETIONS}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
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
      }
    } catch (error) {
      logger().error('Chat completion error:', {
        error,
        chatId,
        roundId,
      })
      throw error
    }
  }

  async handleChatCompletions(res: Response, chatId: string, roundId: string, userId: string) {
    logger().info({
      msg: 'Attempting to handle chat completions',
      data: { chatId, roundId, userId },
    })

    const chatRecord = await prisma().chatRecord.findFirst({
      where: {
        id: roundId,
        chatId: chatId,
        chat: {
          userId,
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
      throw new AuthorizationError('对话记录不存在或无权访问')
    }

    const updateTarget: UpdateTarget = {
      type: 'chat_record',
      chatId,
      roundId,
    }

    try {
      // 根据聊天类型进行不同处理
      if (chatRecord.chat.type === 2) { // report类型
        logger().info({
          msg: 'Processing report type chat',
          data: {
            chatId,
            roundId,
            userId
          }
        })

        // 获取关联的文件
        const fileRelation = chatRecord.chat.fileRelations[0]
        if (!fileRelation?.userFile) {
          throw new ValidationError('未找到关联的文件')
        }

        const userFile = fileRelation.userFile
        const fileContent = await fs.readFile(userFile.filePath, 'utf8')

        // 构建请求体
        const formData = new FormData()
        formData.append('user_input', chatRecord.question)
        formData.append('docx_report', new Blob([fileContent]), userFile.fileName)

        // 调用AI Agent接口
        logger().info({
          msg: 'Sending report request to AI Agent',
          data: {
            url: `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.REPORT_COMPLETIONS}`,
            timeout: CONFIG.AI_AGENT_TIMEOUT,
            filename: userFile.fileName,
            question: chatRecord.question
          }
        })

        const response = await fetchWithTimeout(
          `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.REPORT_COMPLETIONS}`,
          {
            method: 'POST',
            body: formData,
            headers: {
              'Accept': 'text/event-stream'
            }
          },
          60000  // 增加超时时间到 60 秒
        )

        if (!response.ok) {
          throw new Error(`AI 报告对话请求失败: ${response.status}`)
        }

        await handleStreamResponse(response, res, updateTarget)

      } else { // rag类型
        const messages: Message[] = [{
          id: chatRecord.id,
          role: 'user',
          content: sanitizeInput(chatRecord.question),
        }]

        // 先进行关联性检查
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
        
        logger().info({
          msg: 'Relation check response',
          data: {
            response: relationResult,
            chatId,
            roundId,
            userId,
          },
        })

        // 如果内容不相关，返回错误
        if (relationResult.code !== 0 || !relationResult.data.related) {
          logger().info({
            msg: 'Chat content not related',
            data: { roundId, chatId },
          })
          throw new ValidationError('问题与文档内容不相关')
        }

        // 调用 AI Agent 进行对话
        const response = await fetchWithTimeout(
          `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.DATA_COMPLETIONS}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
              chatId,
              roundId,
              recordId: chatRecord.id,
              question: chatRecord.question,
            }),
          },
          CONFIG.AI_AGENT_TIMEOUT
        )

        if (!response.ok) {
          throw new Error(`AI Agent request failed with status ${response.status}`)
        }

        await handleStreamResponse(response, res, updateTarget)
      }
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

  async checkRelation(
    chatId: string,
    question: string
  ): Promise<boolean> {
    logger().info({
      msg: 'Checking content relation',
      data: { chatId, question },
    })

    try {
      // 获取关联的文件
      const chatRecord = await prisma().chat.findFirst({
        where: {
          id: chatId,
        },
        select: {
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
      })

      const fileRelation = chatRecord?.fileRelations[0]
      if (!fileRelation?.userFile) {
        throw new ValidationError('未找到关联的文件')
      }

      const userFile = fileRelation.userFile
      const fileContent = await fs.readFile(userFile.filePath, 'utf8')

      // 构建请求体
      const formData = new FormData()
      formData.append('user_input', question)
      formData.append('docx_report', new Blob([fileContent]), userFile.fileName)

      // 调用AI Agent接口
      logger().info({
        msg: 'Sending relation check request to AI Agent',
        data: {
          url: `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.RELATION_CHECK}`,
          timeout: CONFIG.AI_AGENT_TIMEOUT,
          filename: userFile.fileName,
          question,
        }
      })

      const response = await fetchWithTimeout(
        `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.RELATION_CHECK}`,
        {
          method: 'POST',
          body: formData,
        },
        CONFIG.AI_AGENT_TIMEOUT
      )

      if (!response.ok) {
        throw new Error(`关联性检查请求失败: ${response.status}`)
      }

      const result = await response.json() as RelationCheckResponse
      return result.related === true

    } catch (error) {
      logger().error('Content relation check error:', {
        error,
        chatId,
        question,
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

  async stopChat(chatId: string, roundId: string) {
    logger().info({
      msg: 'Stopping chat',
      data: { chatId, roundId },
    })

    try {
      // 调用 AI Agent 停止接口
      const response = await fetchWithTimeout(
        `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.STOP_CHAT}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId,
            roundId,
          }),
        },
        CONFIG.AI_AGENT_TIMEOUT
      )

      if (!response.ok) {
        throw new Error(`停止对话请求失败: ${response.status}`)
      }

      // 更新对话状态
      await prisma().chatRecord.update({
        where: {
          id: roundId,
        },
        data: {
          status: ChatRecordStatus.STOPPED,
          updateTime: new Date(),
        },
      })

      return {
        code: 0,
        msg: '对话已停止',
      }
    } catch (error) {
      logger().error('Stop chat error:', {
        error,
        chatId,
        roundId,
      })
      throw error
    }
  }

  async updateTitle(chatId: string, res: Response) {
    logger().info({
      msg: 'Updating chat title',
      data: { chatId },
    })

    try {
      // 获取最近的对话记录
      const recentMessages = await prisma().chatRecord.findMany({
        where: {
          chatId,
        },
        orderBy: {
          updateTime: 'desc', // 修改为 updateTime
        },
        take: 5,
        select: {
          question: true,
          answer: true,
        },
      })

      if (recentMessages.length === 0) {
        throw new ValidationError('没有找到对话记录')
      }

      // 构建对话历史
      const messages = recentMessages.reverse().flatMap(record => [
        {
          role: 'user',
          content: record.question,
        },
        {
          role: 'assistant',
          content: record.answer || '',
        },
      ])

      // 调用 AI Agent 生成标题
      const response = await fetchWithTimeout(
        `${CONFIG.AI_AGENT_URL}${CONFIG.AI_AGENT_ENDPOINTS.SUMMARIZE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            messages,
          }),
        },
        CONFIG.AI_AGENT_TIMEOUT
      )

      if (!response.ok) {
        throw new Error(`生成标题请求失败: ${response.status}`)
      }

      const updateTarget: UpdateTarget = {
        type: 'chat_title',
        chatId,
      }

      await handleStreamResponse(response, res, updateTarget)

    } catch (error) {
      logger().error('Update title error:', {
        error,
        chatId,
      })
      throw error
    }
  }
}

export const chatService = new ChatService()