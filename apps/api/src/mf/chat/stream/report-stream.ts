import * as Y from 'yjs'
import { Response as FetchResponse } from 'node-fetch'
import { Request, Response } from 'express'
import { prisma } from '@briefer/database'
import { logger } from '../../../logger.js'
import { WSSharedDocV2, getYDocForUpdate, getDocId } from '../../../yjs/v2/index.js'
import { DocumentPersistor } from '../../../yjs/v2/persistors.js'
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
import { IOServer } from '../../../websocket/index.js'
import { ValidationError, APIError, ERROR_CODES } from '../types/errors.js'
import { ChatRecordStatus, ChatRecordTaskStatus } from '../types/interfaces.js'

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
    variables?: string[]
    label?: string
    content?: string
    options?: Array<{ label: string; value: any }>
    tables?: string[]
    task_id?: string
}

// 创建block的工厂函数
function createBlockFromRequest(blockRequest: BlockRequest): YBlock {
    // 生成一个唯一的ID
    const id = crypto.randomUUID()
    const blocks = new Y.Map<YBlock>()

    switch (blockRequest.type) {
        case 'INPUT':
            const inputBlock = makeInputBlock(id, blocks)
            if (blockRequest.variable) {
                inputBlock.setAttribute('variable', {
                    value: blockRequest.variable,
                    newValue: blockRequest.variable,
                    status: 'idle',
                    error: null
                })
            }
            if (blockRequest.label) {
                inputBlock.setAttribute('label', blockRequest.label)
            }
            return inputBlock

        case 'DROPDOWN_INPUT':
            const dropdownBlock = makeDropdownInputBlock(id, blocks)
            if (blockRequest.options) {
                appendDropdownInputOptions(dropdownBlock, blocks, blockRequest.options.map(o => o.value), true)
            }
            return dropdownBlock

        case 'DATE_INPUT':
            return makeDateInputBlock(id, blocks)

        case 'RICH_TEXT':
            const richTextBlock = makeRichTextBlock(id, blockRequest.variables)
            if (blockRequest.content) {
                const content = new Y.XmlFragment()
                // Create paragraph element for proper structure
                const paragraph = new Y.XmlElement('paragraph')
                const text = new Y.XmlText(blockRequest.content)
                paragraph.insert(0, [text])
                content.insert(0, [paragraph])
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
            throw new ValidationError(`Unsupported block type: ${blockRequest.type}`)
    }
}

// 存储 taskId 和 blockId 的映射关系
const taskBlockMap = new Map<string, string>();

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
    task_id: string,
    updateTarget: ReportUpdateTarget
): Promise<void> {
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

        let blockId: string;
        // 在单个事务中执行所有YJS操作
        updateTarget.yLayout.doc?.transact(() => {
            try {
                // 添加block到文档
                blockId = addBlockGroup(
                    updateTarget.yLayout,
                    updateTarget.yBlocks,
                    block,
                    updateTarget.yLayout.length
                )

                // 使用创建的yBlock
                updateTarget.yBlocks.set(blockId, yBlock)

                // 如果存在 taskId，保存映射关系
                if (task_id) {
                    taskBlockMap.set(task_id, blockId);
                    logger().info({
                        msg: 'Mapped task to block',
                        data: {
                            taskId: task_id,
                            blockId,
                            chatId: updateTarget.chatId,
                            roundId: updateTarget.roundId
                        }
                    });
                }

                // 确保block被正确添加到layout中
                const blockGroup = updateTarget.yLayout.get(updateTarget.yLayout.length - 1)
                if (blockGroup) {
                    const tabs = blockGroup.getAttribute('tabs')
                    if (tabs) {
                        // 设置当前tab
                        const currentRef = new Y.XmlElement('block-ref')
                        currentRef.setAttribute('id', blockId)
                        blockGroup.setAttribute('current', currentRef)
                    }
                }

                logger().info({
                    msg: 'Block added to layout successfully',
                    data: {
                        blockId,
                        blockType: blockData.type,
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId,
                        layoutLength: updateTarget.yLayout.length,
                        hasBlockGroup: !!blockGroup,
                        hasTabs: !!(blockGroup && blockGroup.getAttribute('tabs'))
                    }
                })
            } catch (error) {
                logger().error({
                    msg: 'Failed to add block to layout',
                    data: {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        blockData,
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId
                    }
                })
                throw error
            }
        })

        logger().info({
            msg: 'Block created successfully',
            data: {
                blockId: updateTarget.yBlocks.keys().next().value,
                blockType: blockData.type,
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId
            }
        })
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
    updateTarget: ReportUpdateTarget,
    isLastMsg: boolean
): Promise<void> {
    try {
        const parsedJson = JSON.parse(jsonStr)

        if (parsedJson.type === 'normal') {
            // 处理普通消息
            res.write(`data: ${parsedJson.content}\n\n`)

            // 创建新的对话记录
            await prisma().chatRecord.create({
                data: {
                    id: crypto.randomUUID(),  // 生成新的 UUID
                    chatId: updateTarget.chatId,
                    roundId: updateTarget.roundId,  // 使用原始记录的 ID 作为 roundId
                    question: '',  // 添加空的 question 字段
                    answer: Buffer.from(parsedJson.content),
                    speakerType: 'assistant',
                    status: ChatRecordStatus.COMPLETED, // COMPLETED
                    createdTime: new Date(),
                    updateTime: new Date()
                }
            });

            if (!isLastMsg) {
                res.write('data: [NEW_STEP]\n\n')
            }
        } else if (parsedJson.type === 'document') {
            // 处理文档块
            await handleDocumentBlock(parsedJson.block, parsedJson.task_id, updateTarget)
        } else if (parsedJson.type === 'task') {
            logger().info({
                msg: 'Processing task message',
                data: {
                    phase: parsedJson.phase,
                    params: parsedJson.params,
                    chatId: updateTarget.chatId,
                    roundId: updateTarget.roundId
                }
            })

            // 查找现有的 ChatRecord
            const existingChatRecord = await prisma().chatRecord.findFirst({
                where: {
                    chatId: updateTarget.chatId,
                    roundId: updateTarget.roundId,
                },
                orderBy: {
                    createdTime: 'desc'
                }
            });

            let chatRecord;
            if (existingChatRecord) {
                // 如果存在，使用现有的 ChatRecord
                chatRecord = existingChatRecord;
            } else {
                // 如果不存在，创建新的 ChatRecord
                chatRecord = await prisma().chatRecord.create({
                    data: {
                        id: crypto.randomUUID(),  // 生成新的 UUID
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId,  // 使用原始记录的 ID 作为 roundId
                        question: '',  // 添加空的 question 字段
                        answer: Buffer.from(JSON.stringify(parsedJson)),
                        speakerType: 'assistant',
                        status: ChatRecordStatus.COMPLETED,
                        createdTime: new Date(),
                        updateTime: new Date()
                    }
                });
            }

            let chatRecordTask;
            if (parsedJson.phase === 'CREATE') {
                // 如果有父任务ID，先查找对应的ChatRecordTask记录
                let parentTaskId: string | null = null;
                if (parsedJson.params.parent_id) {
                    const parentTask = await prisma().chatRecordTask.findFirst({
                        where: {
                            chatRecordId: chatRecord.id,
                            agentTaskId: parsedJson.params.parent_id
                        }
                    });
                    if (parentTask) {
                        parentTaskId = parentTask.id;
                    }

                    logger().info({
                        msg: 'Found parent task',
                        data: {
                            parentAgentTaskId: parsedJson.params.parent_id,
                            parentTaskId,
                            chatRecordId: chatRecord.id
                        }
                    });
                }

                // 创建新任务
                chatRecordTask = await prisma().chatRecordTask.create({
                    data: {
                        id: crypto.randomUUID(),
                        chatRecordId: chatRecord.id,
                        agentTaskId: parsedJson.params.id,
                        name: parsedJson.params.name,
                        description: parsedJson.params.description,
                        parentId: parentTaskId, // 使用查询到的父任务ID
                        subTaskCount: parseInt(parsedJson.params.sub_task_count) || 0,
                        status: parsedJson.params.status || ChatRecordTaskStatus.PENDING,
                        variable: parsedJson.params.variable,
                        blockId: taskBlockMap.get(parsedJson.params.id) // 设置关联的 blockId
                    }
                })

                // 从映射中删除已使用的关系
                taskBlockMap.delete(parsedJson.params.id);

                logger().info({
                    msg: 'Created chat record task with block',
                    data: {
                        taskId: chatRecordTask.id,
                        agentTaskId: chatRecordTask.agentTaskId,
                        blockId: chatRecordTask.blockId,
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId
                    }
                });

                // 仅对第一个task消息通过SSE发送
                res.write(`data: ${JSON.stringify({
                    type: 'task',
                    phase: 'CREATE',
                    params: {
                        id: chatRecordTask.id,
                        agent_task_id: chatRecordTask.agentTaskId,
                        name: chatRecordTask.name,
                        description: chatRecordTask.description,
                        parent_id: chatRecordTask.parentId,
                        sub_task_count: chatRecordTask.subTaskCount,
                        status: chatRecordTask.status,
                        variable: chatRecordTask.variable
                    }
                })}\n\n`)

            } else if (parsedJson.phase === 'UPDATE') {
                // 验证 status 是否是 ChatRecordTaskStatus 枚举的值
                if (!Object.values(ChatRecordTaskStatus).includes(parsedJson.params.status)) {
                    throw new Error(`Invalid status: ${parsedJson.params.status}`);
                }

                // 查找对应的 ChatRecord
                const chatRecord = await prisma().chatRecord.findFirst({
                    where: {
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId,
                    },
                    orderBy: {
                        createdTime: 'desc'
                    }
                });

                if (!chatRecord) {
                    throw new Error('ChatRecord not found for task update');
                }

                // 更新任务状态
                await prisma().chatRecordTask.updateMany({
                    where: {
                        chatRecordId: chatRecord.id,
                        agentTaskId: parsedJson.params.id
                    },
                    data: {
                        name: parsedJson.params.name,
                        status: parsedJson.params.status,
                        description: parsedJson.params.description,
                        updateTime: new Date()
                    }
                })

                logger().info({
                    msg: 'Task status updated',
                    data: {
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId,
                        chatRecordId: chatRecord.id,
                        agentTaskId: parsedJson.params.id,
                        newStatus: parsedJson.params.status
                    }
                })
            }
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
        throw error
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

        const record = await prisma().chatRecord.findFirst({
            where: {
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId,
                speakerType: 'user'
            }
        });

        if (record) {
            // 更新状态为已完成
            await Promise.all([
                prisma().chatRecord.update({
                    where: { id: record.id },
                    data: {
                        status: ChatRecordStatus.COMPLETED,
                        updateTime: now
                    }
                }),
                prisma().chat.update({
                    where: { id: updateTarget.chatId },
                    data: { updateTime: now }
                })
            ]);
        }

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

        const record = await prisma().chatRecord.findFirst({
            where: {
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId,
                speakerType: 'user'
            }
        });

        if (record) {
            await prisma().$transaction([
                prisma().chatRecord.update({
                    where: { id: record.id },
                    data: {
                        answer: Buffer.from(completeMessage),
                        status: ChatRecordStatus.ERROR,
                        updateTime: now
                    }
                }),
                prisma().chat.update({
                    where: { id: updateTarget.chatId },
                    data: { updateTime: now }
                })
            ]);
        }

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

// Types and interfaces
interface StreamResponse {
    choices?: Array<{
        delta?: {
            content?: string;
        };
    }>;
}

interface StreamProcessor {
    process(): Promise<void>;
}

// Abstract base class for SSE stream processing
abstract class BaseStreamProcessor implements StreamProcessor {
    protected textDecoder = new TextDecoder();
    protected buffer = '';

    constructor(
        protected response: FetchResponse,
        protected controller?: AbortController
    ) { }

    protected abstract handleData(data: string): Promise<boolean>;
    protected abstract handleError(error: unknown): Promise<void>;
    protected abstract handleAbort(): void;

    protected async processLine(line: string): Promise<boolean> {
        const trimmedLine = line.trim();
        if (!trimmedLine) return false;

        if (trimmedLine.startsWith('data:')) {
            const data = trimmedLine.slice(5).trim();
            return await this.handleData(data);
        }
        return false;
    }

    async process(): Promise<void> {
        if (!this.response.body) {
            throw new APIError(
                'Response body is empty',
                ERROR_CODES.API_ERROR,
                500
            )
        }

        try {
            await this.beforeProcess();
            await this.processStream();
            await this.afterProcess();
        } catch (error) {
            await this.handleError(error);
        }
    }

    protected async beforeProcess(): Promise<void> { }
    protected async afterProcess(): Promise<void> { }

    private async processStream(): Promise<void> {
        const stream = this.response.body;
        if (!stream) {
            throw new APIError(
                'Response body is empty',
                ERROR_CODES.API_ERROR,
                500
            )
        }

        for await (const chunk of stream) {
            if (this.controller?.signal.aborted) {
                this.handleAbort();
                break;
            }

            this.buffer += this.textDecoder.decode(chunk as Buffer, { stream: true });
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() || '';

            for (const line of lines) {
                const isDone = await this.processLine(line);
                if (isDone) return;
            }
        }

        // Process remaining buffer
        if (this.buffer.trim()) {
            await this.processLine(this.buffer);
        }
    }
}

// Report specific types and interfaces
interface ReportStreamConfig {
    chatId: string;
    roundId: string;
    res: Response;
    yDoc: WSSharedDocV2;
}

// Report stream processor implementation
class ReportStreamProcessor extends BaseStreamProcessor {
    private completeMessage = '';
    private jsonBuffer = '';
    private isCollectingJson = false;
    private pendingJsonMessage: string | null = null;  // 存储待处理的完整 JSON 消息
    private updateTarget: ReportUpdateTarget;

    constructor(
        response: FetchResponse,
        private config: ReportStreamConfig,
        controller?: AbortController
    ) {
        super(response, controller);
        this.updateTarget = {
            type: 'chat_record',
            chatId: config.chatId,
            roundId: config.roundId,
            yDoc: config.yDoc,
            yLayout: config.yDoc.ydoc.getArray('layout'),
            yBlocks: config.yDoc.ydoc.getMap('blocks')
        };
    }

    protected async beforeProcess(): Promise<void> {
        // 更新状态为聊天中
        const record = await prisma().chatRecord.findFirst({
            where: {
                chatId: this.config.chatId,
                roundId: this.config.roundId,
                speakerType: 'user'
            }
        });

        if (record) {
            await prisma().chatRecord.update({
                where: { id: record.id },
                data: { status: ChatRecordStatus.PROCESSING }
            });
        }
    }

    protected async handleData(data: string): Promise<boolean> {
        // 如果是 [DONE] 消息，处理待发送的消息（如果有）并结束
        if (data === '[DONE]') {
            if (this.pendingJsonMessage) {
                // 处理最后一条消息，但不发送 [NEW_STEP]
                await handleJsonContent(this.pendingJsonMessage, this.config.res, this.updateTarget, true);
                this.pendingJsonMessage = null;
            }
            await handleStreamEnd(this.config.res, this.updateTarget, this.completeMessage);
            return true;
        }

        try {
            // 尝试解析为 JSON
            const jsonData = JSON.parse(data) as StreamResponse;
            const content = jsonData.choices?.[0]?.delta?.content || '';
            if (content && typeof content === 'string') {
                await this.processContent(content);
            }
        } catch (jsonError) {
            logger().error({
                msg: 'Failed to parse SSE data',
                data: {
                    rawData: data,
                    error: jsonError instanceof Error ? jsonError.message : 'Unknown error',
                    chatId: this.config.chatId,
                    roundId: this.config.roundId
                }
            });
        }

        return false;
    }

    private async processContent(content: string): Promise<void> {
        // 处理 JSON 开始标记
        if (content.includes('```json')) {
            this.isCollectingJson = true;
            this.jsonBuffer = '';
            return;
        }

        // 处理 JSON 结束标记
        if (this.isCollectingJson && content.includes('```')) {
            const currentJsonMessage = this.jsonBuffer.trim();  // 清理可能的空白字符
            this.isCollectingJson = false;
            this.jsonBuffer = '';

            // 处理之前缓存的消息（如果有）
            if (this.pendingJsonMessage) {
                await handleJsonContent(
                    this.pendingJsonMessage,
                    this.config.res,
                    this.updateTarget,
                    false  // 不是最后一条消息，因为现在有新消息
                );
                this.pendingJsonMessage = null;
            }

            this.pendingJsonMessage = currentJsonMessage;
            return;
        }

        // 收集 JSON 内容
        if (this.isCollectingJson) {
            this.jsonBuffer += content;
            return;
        }

        // 处理普通文本内容
        this.completeMessage += content;
        this.config.res.write(`data: ${content}\n\n`);
    }

    protected handleAbort(): void {
        logger().info({
            msg: 'Stream processing aborted',
            data: { roundId: this.config.roundId }
        });
    }

    protected async handleError(error: unknown): Promise<void> {
        await handleStreamError(error, this.config.res, this.updateTarget, this.completeMessage);
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
    const chatDocRelation = await prisma().chatDocumentRelation.findFirst({
        where: { chatId },
        select: { documentId: true }
    });

    if (!chatDocRelation) {
        throw new ValidationError('Document relation not found')
    }

    const workspace = Object.values(req.session.userWorkspaces ?? {})[0];
    if (!workspace?.workspaceId) {
        throw new ValidationError('未找到有效的工作区')
    }

    const docId = getDocId(chatDocRelation.documentId, null);
    const { yDoc } = await getYDocForUpdate(
        docId,
        socketServer,
        chatDocRelation.documentId,
        workspace.workspaceId,
        (doc) => ({
            yDoc: doc
        }),
        new DocumentPersistor(chatDocRelation.documentId)
    );

    const processor = new ReportStreamProcessor(
        response,
        {
            chatId,
            roundId,
            res,
            yDoc
        },
        controller
    );

    await processor.process();
}