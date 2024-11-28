import * as Y from 'yjs'
import { Response as FetchResponse } from 'node-fetch'
import { Request, Response } from 'express'
import { prisma } from '@briefer/database'
import { logger } from '../../logger.js'
import { WSSharedDocV2, getYDocForUpdate } from '../../yjs/v2/index.js'
import { DocumentPersistor } from '../../yjs/v2/persistors.js'
import { YBlock, YBlockGroup } from '@briefer/editor'
import { addBlockGroup, AddBlockGroupBlock } from '@briefer/editor'
import {
    makeInputBlock,
    makeDropdownInputBlock,
    makeDateInputBlock,
    makeRichTextBlock,
    makePythonBlock,
    makeSQLBlock,
    appendDropdownInputOptions
} from '@briefer/editor'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { IOServer } from '../../websocket/index.js'

// 定义更新目标类型
export interface ReportUpdateTarget {
    type: 'chat_record'
    chatId: string
    roundId: string
    yDoc: WSSharedDocV2
    yLayout: Y.Array<YBlockGroup>
    yBlocks: Y.Map<YBlock>
}

// 定义block创建请求类型
interface BlockRequest {
    type: string
    variable?: string
    label?: string
    content?: string
    options?: Array<{ label: string; value: any }>
    tables?: string[]
}

// 创建block的工厂函数
function createBlockFromRequest(blockRequest: BlockRequest): YBlock {
    // 生成一个唯一的ID
    const id = crypto.randomUUID()
    const blocks = new Y.Map<YBlock>()

    switch (blockRequest.type) {
        case 'INPUT':
            return makeInputBlock(id, blocks)

        case 'DROPDOWN_INPUT':
            const dropdownBlock = makeDropdownInputBlock(id, blocks)
            if (blockRequest.options) {
                appendDropdownInputOptions(dropdownBlock, blocks, blockRequest.options.map(o => o.value), true)
            }
            return dropdownBlock

        case 'DATE_INPUT':
            return makeDateInputBlock(id, blocks)

        case 'RICH_TEXT':
            const richTextBlock = makeRichTextBlock(id)
            if (blockRequest.content) {
                const content = new Y.XmlFragment()
                const text = new Y.XmlText(blockRequest.content)
                content.insert(0, [text])
                richTextBlock.setAttribute('content', content)
            }
            return richTextBlock

        case 'PYTHON':
            const pythonBlock = makePythonBlock(id, { source: blockRequest.content })
            return pythonBlock

        case 'SQL':
            const sqlBlock = makeSQLBlock(id, blocks, { source: blockRequest.content })
            return sqlBlock

        default:
            throw new Error(`Unsupported block type: ${blockRequest.type}`)
    }
}

// 写入 SSE 日志的辅助函数
async function appendToSSELog(chatId: string, roundId: string, content: string): Promise<void> {
    try {
        // 使用固定的日志路径
        const logDir = '/Users/jingcai/Dev/mindflow/mindflow/apps/api/logs/sse'
        const logFile = path.join(logDir, `${chatId}_${roundId}.log`)

        try {
            // 确保日志目录存在
            await fs.promises.mkdir(logDir, { recursive: true })
        } catch (mkdirError) {
            logger().error({
                msg: 'Failed to create log directory',
                data: {
                    error: mkdirError instanceof Error ? mkdirError.message : 'Unknown error',
                    logDir
                }
            })
            throw mkdirError
        }

        // 添加时间戳
        const timestamp = new Date().toISOString()
        const logEntry = `[${timestamp}] ${content}\n`

        // 追加写入日志
        await fs.promises.appendFile(logFile, logEntry, { encoding: 'utf8', flag: 'a' })

        logger().info({
            msg: 'SSE log written successfully',
            data: {
                logFile,
                chatId,
                roundId
            }
        })
    } catch (error) {
        logger().error({
            msg: 'Failed to write SSE log',
            data: {
                error: error instanceof Error ? error.message : 'Unknown error',
                chatId,
                roundId
            }
        })
    }
}

// 处理文档块
async function handleDocumentBlock(
    blockData: any,
    updateTarget: ReportUpdateTarget
): Promise<string> {
    try {
        // 创建block并转换为AddBlockGroupBlock类型
        const yBlock = createBlockFromRequest(blockData)
        const block: AddBlockGroupBlock = {
            type: blockData.type,
            ...(blockData.content && { content: blockData.content }),
            ...(blockData.variable && { variable: blockData.variable }),
            ...(blockData.label && { label: blockData.label }),
            ...(blockData.options && { options: blockData.options }),
            ...(blockData.tables && { tables: blockData.tables })
        }

        // 添加block到文档
        const blockId = addBlockGroup(
            updateTarget.yLayout,
            updateTarget.yBlocks,
            block,
            updateTarget.yLayout.length
        )

        // 使用创建的yBlock
        updateTarget.yBlocks.set(blockId, yBlock)

        logger().info({
            msg: 'Block created successfully',
            data: {
                blockId,
                blockType: blockData.type,
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId
            }
        })

        return blockId
    } catch (error) {
        logger().error({
            msg: 'Failed to create block',
            data: {
                error: error instanceof Error ? error.message : 'Unknown error',
                blockData,
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId
            }
        })
        throw error
    }
}

// 处理JSON内容
async function handleJsonContent(
    jsonStr: string,
    res: Response,
    updateTarget: ReportUpdateTarget
): Promise<void> {
    try {
        const parsedJson = JSON.parse(jsonStr)

        if (parsedJson.type === 'normal') {
            // 处理普通消息
            res.write(`data: ${parsedJson.content}\n\n`)

            // 写入完整消息到日志
            await appendToSSELog(updateTarget.chatId, updateTarget.roundId, parsedJson.content);

            // 创建新的对话记录
            await prisma().chatRecord.create({
                data: {
                    id: crypto.randomUUID(),  // 生成新的 UUID
                    chatId: updateTarget.chatId,
                    roundId: updateTarget.roundId,  // 使用原始记录的 ID 作为 roundId
                    question: '',  // 添加空的 question 字段
                    answer: Buffer.from(parsedJson.content),
                    speakerType: 'assistant',
                    status: 3, // COMPLETED
                    createdTime: new Date(),
                    updateTime: new Date()
                }
            });

            res.write('data: [NEW_STEP]\n\n')
        } else if (parsedJson.type === 'document') {
            // 处理文档块
            const blockId = await handleDocumentBlock(parsedJson.block, updateTarget)

            // 发送确认消息
            res.write(`data: Block created: ${parsedJson.block.type} (${blockId})\n\n`)
        }
    } catch (error) {
        logger().error({
            msg: 'Failed to parse or handle JSON content',
            data: {
                error: error instanceof Error ? error.message : 'Unknown error',
                jsonStr,
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId
            }
        })
    }
}

// 处理流结束
async function handleStreamEnd(
    res: Response,
    updateTarget: ReportUpdateTarget,
    completeMessage: string
): Promise<void> {
    try {
        const now = new Date()

        // 更新状态为已完成
        await Promise.all([
            prisma().chatRecord.update({
                where: { id: updateTarget.roundId },
                data: {
                    status: 3, // COMPLETED
                    updateTime: now
                }
            }),
            prisma().chat.update({
                where: { id: updateTarget.chatId },
                data: { updateTime: now }
            })
        ])

        res.write('data: [DONE]\n\n')
    } catch (error) {
        logger().error({
            msg: 'Failed to handle stream end',
            data: {
                error: error instanceof Error ? error.message : 'Unknown error',
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId
            }
        })
    }
}

// 处理流错误
async function handleStreamError(
    error: unknown,
    res: Response,
    updateTarget: ReportUpdateTarget,
    completeMessage: string
): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger().error({
        msg: 'Stream processing error',
        data: {
            error: errorMessage,
            chatId: updateTarget.chatId,
            roundId: updateTarget.roundId
        }
    })

    try {
        const now = new Date()

        await prisma().$transaction([
            prisma().chatRecord.update({
                where: { id: updateTarget.roundId },
                data: {
                    answer: Buffer.from(completeMessage),
                    status: 4, // FAILED
                    updateTime: now
                }
            }),
            prisma().chat.update({
                where: { id: updateTarget.chatId },
                data: { updateTime: now }
            })
        ])

        res.write(`data: Error: ${errorMessage}\n\n`)
        res.write('data: [DONE]\n\n')
    } catch (dbError) {
        logger().error({
            msg: 'Failed to update chat status after error',
            data: {
                error: dbError instanceof Error ? dbError.message : 'Unknown error',
                originalError: errorMessage,
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId
            }
        })
    }
}

// 主处理函数
export async function handleReportStreamResponse(
    response: FetchResponse,
    req: Request,
    res: Response,
    chatId: string,
    roundId: string,
    socketServer: IOServer,
    controller?: AbortController
): Promise<void> {
    if (!response.body) {
        throw new Error('Response body is empty')
    }

    // 获取关联的文档ID
    const chatDocRelation = await prisma().chatDocumentRelation.findFirst({
        where: { chatId },
        select: { documentId: true }
    })

    if (!chatDocRelation) {
        throw new Error('Document relation not found')
    }

    const workspace = Object.values(req.session.userWorkspaces ?? {})[0]
    if (!workspace?.workspaceId) {
        throw new Error('未找到有效的工作区')
    }

    // 使用已有的getYDocForUpdate函数
    const { yDoc } = await getYDocForUpdate(
        chatDocRelation.documentId,  // id
        socketServer,        // socketServer
        chatDocRelation.documentId,  // documentId
        workspace.workspaceId,  // workspaceId - from user session
        (doc) => ({
            yDoc: doc
        }),
        new DocumentPersistor(chatDocRelation.documentId)     // persistor - create new DocumentPersistor instance with documentId
    );

    const updateTarget: ReportUpdateTarget = {
        type: 'chat_record',
        chatId,
        roundId,
        yDoc,
        yLayout: yDoc.ydoc.getArray('layout'),
        yBlocks: yDoc.ydoc.getMap('blocks')
    }

    const stream = response.body
    const textDecoder = new TextDecoder()
    let buffer = ''
    let completeMessage = ''
    let jsonBuffer = ''
    let isCollectingJson = false

    try {
        // 更新状态为聊天中
        await prisma().chatRecord.update({
            where: { id: roundId },
            data: { status: 2 } // CHATTING
        })

        for await (const chunk of stream) {
            if (controller?.signal.aborted) {
                logger().info({
                    msg: 'Stream processing aborted',
                    data: { roundId }
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

                    if (data === '[DONE]') {
                        await handleStreamEnd(res, updateTarget, completeMessage)
                        return
                    }

                    try {
                        const jsonData = JSON.parse(data)
                        const content = jsonData.choices?.[0]?.delta?.content || ''

                        if (content && typeof content === 'string') {
                            if (content.includes('```json')) {
                                isCollectingJson = true
                                jsonBuffer = ''
                                continue
                            }

                            if (isCollectingJson && content.includes('```')) {
                                isCollectingJson = false
                                await handleJsonContent(jsonBuffer, res, updateTarget)
                                jsonBuffer = ''
                                continue
                            }

                            if (isCollectingJson) {
                                jsonBuffer += content
                                continue
                            }

                            completeMessage += content
                        }
                    } catch (jsonError) {
                        logger().error({
                            msg: 'Failed to parse SSE data',
                            data: {
                                rawData: data,
                                error: jsonError instanceof Error ? jsonError.message : 'Unknown error',
                                chatId,
                                roundId
                            }
                        })
                    }
                }
            }
        }

        // 处理最后的缓冲区
        if (buffer.trim()) {
            const data = buffer.trim()
            if (data.startsWith('data:')) {
                try {
                    const jsonData = JSON.parse(data.slice(5).trim())
                    const content = jsonData.choices?.[0]?.delta?.content || ''
                    if (content && typeof content === 'string') {
                        completeMessage += content
                        res.write(`data: ${content}\n\n`)
                    }
                } catch (parseError) {
                    logger().error({
                        msg: 'Failed to parse final buffer',
                        data: {
                            buffer: data,
                            error: parseError instanceof Error ? parseError.message : 'Unknown error'
                        }
                    })
                }
            }
        }

        await handleStreamEnd(res, updateTarget, completeMessage)
    } catch (error) {
        await handleStreamError(error, res, updateTarget, completeMessage)
    }
}