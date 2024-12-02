import { Request, Response } from 'express'
import { prisma, createDocument } from '@briefer/database'
import { ChatSpeakerType } from '@prisma/client'
import { AuthorizationError, ValidationError } from '../types/errors.js'
import { activeRequests, fetchWithTimeout } from '../utils/fetch.js'
import { Response as FetchResponse } from 'node-fetch'
import { CONFIG } from '../config/constants.js'
import { logger } from '../../../logger.js'
import { handleStreamResponse, sendSSEError } from '../utils/sse.js'
import { ChatDetailResponse, Message, RelationCheckResponse, UpdateTarget } from '../types/interfaces.js'
import * as fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { sanitizeInput, formatDate } from '../utils/format.js'
import { titleUpdateEmitter } from '../title-summarizer.js'
import { IOServer } from '../../../websocket/index.js'
import { validateEnvVars } from '../utils/validation.js'
import { handleReportStreamResponse } from '../report-stream.js'

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

    // 先检查聊天是否存在且属于当前用户
    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId: userId,
      },
    })

    if (!chat) {
      return new AuthorizationError('对话不存在或无权限删除');
    }

    let filesToDelete: { fileId: string, filePath: string }[] = []

    // 使用事务确保数据一致性
    await prisma().$transaction(async (tx) => {
      // 0. 获取关联的文件信息
      const fileRelations = await tx.chatFileRelation.findMany({
        where: { chatId: chatId },
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
        where: { chatId: chatId },
        select: { documentId: true }
      })

      // 2. 删除聊天记录
      await tx.chatRecord.deleteMany({
        where: { chatId: chatId }
      })

      // 3. 删除文档关联
      await tx.chatDocumentRelation.deleteMany({
        where: { chatId: chatId }
      })

      // 4. 删除文件关联
      await tx.chatFileRelation.deleteMany({
        where: { chatId: chatId }
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
        where: { id: chatId }
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
        chatId: chatId,
        userId: userId,
      },
    })
  }

  async createChatRound(chatId: string, userId: string, question: string) {
    logger().info({
      msg: 'Attempting to create chat round',
      data: { chatId, userId },
    })

    const chat = await prisma().chat.findFirst({
      where: {
        id: chatId,
        userId: userId,
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

    return {
      roundId: chatRecord.roundId
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

  async handleChatCompletions(
    req: Request,
    res: Response,
    chatId: string,
    roundId: string,
    userId: string,
    socketServer: IOServer
  ) {
    const controller = new AbortController()

    try {
        validateEnvVars()

        const chatRecord = await prisma().chatRecord.findFirst({
          where: {
            id: roundId,
            chatId: chatId,
            chat: {
              userId: userId,
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
                userId: userId
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
                userId: userId,
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
          await sendSSEError(res, error, {
            type: 'chat_record',
            chatId: req.query['chatId'] as string,
            roundId: req.query['roundId'] as string,
          })
        }
    } catch (error) {
      console.error('Error in chat completions:', error)
      throw new Error('Failed to get chat completions')
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
        chatId: chatId,
        userId,
        type: responseData.type,
        messageCount: messages.length,
      },
    })

    return responseData
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

    return { status, roundId }
  }

  async stopChat(roundId: string, userId: string) {
    try {
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
        return
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
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return new AuthorizationError(error.message)
      }
      return error;
    }
  }

  async updateTitle(chatId: string, userId: string, req: Request, res: Response) {
    logger().info({
      msg: 'Updating chat title',
      data: { chatId },
    })

    try {
      logger().info({
        msg: 'Title update SSE connection established',
        data: {
          userId,
          currentListeners: titleUpdateEmitter.listenerCount('titleUpdate'),
        },
      })

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

    } catch (error) {
      logger().error({
        msg: 'Title update SSE error',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          userId,
        },
      })
      if (!res.writableEnded) {
        res.end()
      }
    }
  }
}

export const chatService = new ChatService()