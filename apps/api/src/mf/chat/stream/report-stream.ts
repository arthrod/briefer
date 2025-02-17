import * as Y from 'yjs'
import { Response as FetchResponse } from 'node-fetch'
import { Request, Response } from 'express'
import { prisma } from '@briefer/database'
import { logger } from '../../../logger.js'
import { WSSharedDocV2, getYDocForUpdate, getDocId } from '../../../yjs/v2/index.js'
import { DocumentPersistor } from '../../../yjs/v2/persistors.js'
import { dateInputValueFromDate, formatDateInputValue, YBlock, YBlockGroup } from '@briefer/editor'
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
import { ValidationError, APIError } from '../types/errors.js'
import { ChatRecordStatus, ChatRecordTaskStatus } from '../types/interfaces.js'
import { ErrorCode } from '../../../constants/errorcode.js'

// 定义更新目标类型
interface ReportUpdateTarget {
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
    default?: string
}

/**
 * Creates a Yjs block based on the provided block request.
 *
 * This factory function generates a unique identifier and a block map, validates the necessary fields,
 * logs the creation process, and then constructs a Yjs block based on the specified type within the request.
 *
 * Supported block types:
 * - INPUT: Requires a `variable`; optionally accepts a `label`.
 * - DROPDOWN_INPUT: Requires a valid array of `options`.
 * - DATE_INPUT: Sets attributes for `variable` and `label` if provided, and parses a default date from a Chinese date format ("YYYY年M月D日").
 * - RICH_TEXT: Requires `content`; creates a rich text block with a structured XML fragment.
 * - PYTHON: Constructs a Python block using the provided `content` as source code.
 * - SQL: Requires a `variable` to assign the dataframe name; uses `content` as source code.
 *
 * @param blockRequest - An object containing the parameters required to construct a block.
 * @throws ValidationError - If required fields are missing or if the provided block type is unsupported.
 * @returns A newly created Yjs block corresponding to the given block request.
 */
function createBlockFromRequest(blockRequest: BlockRequest): YBlock {
    // 生成一个唯一的ID
    const id = crypto.randomUUID()
    const blocks = new Y.Map<YBlock>()

    // 验证基本字段
    if (!blockRequest.type) {
        throw new ValidationError('Block type is required');
    }

    // 记录block创建尝试
    logger().debug({
        msg: 'Creating block from request',
        data: {
            blockType: blockRequest.type,
            hasContent: !!blockRequest.content,
            hasVariable: !!blockRequest.variable,
            hasVariables: !!blockRequest.variables,
            hasOptions: !!blockRequest.options,
            hasTables: !!blockRequest.tables
        }
    });

    switch (blockRequest.type) {
        case 'INPUT':
            if (!blockRequest.variable) {
                throw new ValidationError('Variable is required for INPUT block');
            }
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
            if (!blockRequest.options || !Array.isArray(blockRequest.options)) {
                throw new ValidationError('Options array is required for DROPDOWN_INPUT block');
            }
            const dropdownBlock = makeDropdownInputBlock(id, blocks)
            if (blockRequest.options) {
                appendDropdownInputOptions(dropdownBlock, blocks, blockRequest.options.map(o => o.value), true)
            }
            return dropdownBlock

        case 'DATE_INPUT':
            const dateInputBlock = makeDateInputBlock(id, blocks)
            if (blockRequest.variable) {
                dateInputBlock.setAttribute('variable', blockRequest.variable)
                dateInputBlock.setAttribute('newVariable', new Y.Text(blockRequest.variable))
            }
            if (blockRequest.label) {
                dateInputBlock.setAttribute('label', new Y.Text(blockRequest.label))
            }
            if (blockRequest.default) {
                // Parse the Chinese date format "2024年9月30日" to a Date object
                const match = blockRequest.default.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
                if (match) {
                    // Since we know the regex pattern will always capture these groups if there's a match
                    const [_, year, month, day] = match as [string, string, string, string]
                    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
                    const value = dateInputValueFromDate(date, 'UTC')
                    const formattedValue = formatDateInputValue(value, 'date')
                    dateInputBlock.setAttribute('value', value)
                    dateInputBlock.setAttribute('newValue', new Y.Text(formattedValue))
                }
            }
            return dateInputBlock

        case 'RICH_TEXT':
            if (!blockRequest.content) {
                throw new ValidationError('Content is required for RICH_TEXT block');
            }
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
            if (!blockRequest.variable) {
                throw new ValidationError('Variable is required for SQL block');
            }
            const sqlBlock = makeSQLBlock(id, blocks, { source: blockRequest.content })
            if (blockRequest.variable) {
                sqlBlock.setAttribute('dataframeName', {
                    value: blockRequest.variable,
                    newValue: blockRequest.variable,
                    status: 'idle'
                })
            }
            return sqlBlock

        default:
            throw new ValidationError(`Unsupported block type: ${blockRequest.type}`)
    }
}

// 存储 taskId 和 blockId 的映射关系
const taskBlockMap = new Map<string, string>();

/**
 * Appends a log entry to a Server-Sent Events (SSE) log file.
 *
 * This helper function writes the provided log content to a log file specific to the given chat and round.
 * It first ensures that the log directory exists, then prefixes the log entry with an ISO timestamp before
 * appending it to a file named in the format `<chatId>_<roundId>.log`. All operations are performed
 * asynchronously.
 *
 * @param chatId - The identifier for the chat session.
 * @param roundId - The identifier for the chat round.
 * @param content - The log message to append, which will be prefixed with a timestamp.
 *
 * @returns A Promise that resolves when the log entry has been successfully written.
 *
 * @remarks
 * The log directory is hard-coded to a specific path. Any errors encountered during directory creation or file
 * appending are logged using the application's logger and are not re-thrown.
 */
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

/**
 * Processes a document block and integrates it into the Yjs document layout.
 *
 * This function validates the provided block data and Yjs document state before proceeding. It logs the attempt to create a block, creates a Yjs block using the input data, and constructs a block object with optional fields such as content, variable, label, options, tables, and variables. All Yjs updates are executed within a single transaction to ensure atomicity. If a valid task ID is provided, the function maps the task to the created block.
 *
 * @param blockData - The block information to process. Must be an object and contain at least a "type" field.
 * @param task_id - The identifier for the associated task. If provided, the task will be mapped to the block.
 * @param updateTarget - An object containing Yjs document references (yDoc, yLayout, yBlocks) and identifiers for the chat and round.
 *
 * @throws ValidationError - Thrown when blockData is invalid (e.g., not an object or missing the "type" property) or if the Yjs document state is incomplete.
 * @throws Error - Thrown if an error occurs during the Yjs transaction, such as failing to locate the block group after addition.
 *
 * @example
 * try {
 *   await handleDocumentBlock({ type: 'INPUT', content: 'Sample content' }, 'task123', updateTarget);
 * } catch (error) {
 *   // Handle error appropriately.
 * }
 */
async function handleDocumentBlock(
    blockData: any,
    task_id: string,
    updateTarget: ReportUpdateTarget
): Promise<void> {
    try {
        // 验证输入数据
        if (!blockData || typeof blockData !== 'object') {
            throw new ValidationError('Invalid block data: blockData must be an object');
        }
        if (!blockData.type) {
            throw new ValidationError('Invalid block data: type is required');
        }

        // 验证 Yjs 文档状态
        if (!updateTarget.yDoc || !updateTarget.yLayout || !updateTarget.yBlocks) {
            throw new ValidationError('Invalid Yjs document state');
        }

        // 在创建 block 之前记录数据
        logger().info({
            msg: 'Attempting to create block',
            data: {
                blockType: blockData.type,
                blockContent: blockData.content ? '(content exists)' : '(no content)',
                taskId: task_id,
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId,
                layoutLength: updateTarget.yLayout.length
            }
        });

        // 创建block并转换为AddBlockGroupBlock类型
        const yBlock = createBlockFromRequest(blockData)
        const block: AddBlockGroupBlock = {
            type: blockData.type,
            ...(blockData.content && { content: blockData.content }),
            ...(blockData.variable && { variable: blockData.variable }),
            ...(blockData.label && { label: blockData.label }),
            ...(blockData.options && { options: blockData.options }),
            ...(blockData.tables && { tables: blockData.tables }),
            ...(blockData.variables && { variables: blockData.variables })
        }

        // 初始化 blockId
        let blockId = '';

        // 在单个事务中执行所有YJS操作
        updateTarget.yLayout.doc?.transact(() => {
            try {
                // 记录事务开始
                logger().debug({
                    msg: 'Starting Yjs transaction',
                    data: {
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId
                    }
                });

                // 添加block到文档
                blockId = addBlockGroup(
                    updateTarget.yLayout,
                    updateTarget.yBlocks,
                    block,
                    updateTarget.yLayout.length
                )

                // 使用创建的yBlock
                updateTarget.yBlocks.set(blockId, yBlock)

                // 记录block添加成功
                logger().debug({
                    msg: 'Block added to yBlocks',
                    data: {
                        blockId,
                        blockType: blockData.type,
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId
                    }
                });

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
                if (!blockGroup) {
                    throw new Error('Block group not found after addition');
                }

                const tabs = blockGroup.getAttribute('tabs')
                if (tabs) {
                    // 设置当前tab
                    const currentRef = new Y.XmlElement('block-ref')
                    currentRef.setAttribute('id', blockId)
                    blockGroup.setAttribute('current', currentRef)
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
                        hasTabs: !!tabs
                    }
                })
            } catch (error) {
                logger().error({
                    msg: 'Failed to add block in transaction',
                    data: {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        stack: error instanceof Error ? error.stack : undefined,
                        blockData,
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId
                    }
                })
                throw error
            }
        })

        logger().info({
            msg: 'Block creation completed',
            data: {
                blockId: blockId,
                blockType: blockData.type,
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId,
                yBlocksSize: updateTarget.yBlocks.size,
                yLayoutLength: updateTarget.yLayout.length
            }
        })
    } catch (error) {
        logger().error({
            msg: 'Failed to create block',
            data: {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                blockData,
                chatId: updateTarget.chatId,
                roundId: updateTarget.roundId
            }
        })
        throw error
    }
}

/**
 * Processes a JSON string containing different types of messages and updates the response and database accordingly.
 *
 * This function parses the provided JSON string and handles its content based on the "type" field. It supports three message types:
 * - "normal": Writes plain message content to the response and creates a new chat record. If the message is not the last in the stream, it sends an additional "NEW_STEP" signal.
 * - "document": Validates the document block structure, processes the block with `handleDocumentBlock`, and updates the task's block ID in the database if applicable.
 * - "task": Processes task messages by either creating a new chat record task (on "CREATE" phase) or updating an existing task (on "UPDATE" phase), and logs relevant information.
 *
 * The function interacts with the response object for server-sent events, uses Prisma for database operations, and logs various events, warnings, and errors.
 *
 * @param jsonStr - The JSON string to be parsed and handled.
 * @param res - The response object used to send SSE messages.
 * @param updateTarget - Contains chat and round identifiers and additional data needed for updating the document.
 * @param isLastMsg - Indicates whether the current message is the final message in the stream.
 * @returns A promise that resolves when JSON processing and all associated operations are complete.
 *
 * @throws ValidationError If a document message is missing or contains invalid block data.
 * @throws Error For any errors encountered during JSON parsing, database operations, or task updates.
 */
async function handleJsonContent(
    jsonStr: string,
    res: Response,
    updateTarget: ReportUpdateTarget,
    isLastMsg: boolean
): Promise<void> {
    try {
        const parsedJson = JSON.parse(jsonStr)

        // appendToSSELog(updateTarget.chatId, updateTarget.roundId, jsonStr)

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
            // 验证文档消息的结构
            if (!parsedJson.block || typeof parsedJson.block !== 'object') {
                const error = new ValidationError('Invalid document message: missing or invalid block data');
                logger().error({
                    msg: 'Document message validation failed',
                    data: {
                        error: error.message,
                        receivedData: parsedJson,
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId
                    }
                });
                throw error;
            }

            // 记录接收到的文档消息
            logger().info({
                msg: 'Received document message',
                data: {
                    blockType: parsedJson.block.type,
                    taskId: parsedJson.task_id,
                    chatId: updateTarget.chatId,
                    roundId: updateTarget.roundId,
                    hasContent: !!parsedJson.block.content
                }
            });

            try {
                await handleDocumentBlock(parsedJson.block, parsedJson.task_id, updateTarget);

                // 如果这个文档块对应的任务已经创建，更新任务的 blockId
                const existingTask = await prisma().chatRecordTask.findFirst({
                    where: {
                        agentTaskId: parsedJson.task_id,
                        chatRecord: {
                            chatId: updateTarget.chatId,
                            roundId: updateTarget.roundId
                        }
                    },
                    include: {
                        chatRecord: true
                    }
                });

                if (existingTask) {
                    const blockId = taskBlockMap.get(parsedJson.task_id);
                    
                    if (blockId) {
                        await prisma().chatRecordTask.update({
                            where: {
                                id: existingTask.id
                            },
                            data: {
                                blockId: blockId
                            }
                        });

                        logger().info({
                            msg: 'Updated existing task with blockId',
                            data: {
                                taskId: existingTask.id,
                                blockId,
                                agentTaskId: parsedJson.task_id,
                                chatId: updateTarget.chatId,
                                roundId: updateTarget.roundId
                            }
                        });
                    }
                }
            } catch (error) {
                logger().error({
                    msg: 'Failed to handle document block',
                    data: {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        stack: error instanceof Error ? error.stack : undefined,
                        blockData: parsedJson.block,
                        taskId: parsedJson.task_id,
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId
                    }
                });
                throw error;
            }
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
                // 检查当前轮次是否已经有任务
                const existingTasks = await prisma().chatRecordTask.findFirst({
                    where: {
                        chatRecordId: chatRecord.id
                    }
                });

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
                        parentId: parentTaskId,
                        subTaskCount: parseInt(parsedJson.params.sub_task_count) || 0,
                        status: parsedJson.params.status || ChatRecordTaskStatus.PENDING,
                        variable: parsedJson.params.variable,
                        blockId: taskBlockMap.get(parsedJson.params.id)
                    }
                })

                // 记录任务创建状态
                logger().info({
                    msg: 'Created chat record task',
                    data: {
                        taskId: chatRecordTask.id,
                        agentTaskId: chatRecordTask.agentTaskId,
                        blockId: chatRecordTask.blockId,
                        variable: chatRecordTask.variable,
                        chatId: updateTarget.chatId,
                        roundId: updateTarget.roundId,
                        hasBlockId: !!taskBlockMap.get(parsedJson.params.id),
                        taskMapSize: taskBlockMap.size,
                        availableTaskIds: Array.from(taskBlockMap.keys())
                    }
                });

                // 从映射中删除已使用的关系
                if (chatRecordTask.blockId) {
                    taskBlockMap.delete(parsedJson.params.id);
                    logger().debug({
                        msg: 'Removed task-block mapping',
                        data: {
                            agentTaskId: parsedJson.params.id,
                            remainingMappings: taskBlockMap.size
                        }
                    });
                }

                // 仅在没有已存在任务时发送消息
                if (!existingTasks) {
                    res.write(`data: ${JSON.stringify({
                        type: 'step',
                        content: {
                            jobs: [{
                                title: chatRecordTask.name,
                                description: chatRecordTask.description || '',
                                status: chatRecordTask.status.toLowerCase(),
                                modules: []
                            }]
                        }
                    })}\n\n`);
                }
            } else if (parsedJson.phase === 'UPDATE') {
                // 验证 status 是否是 ChatRecordTaskStatus 枚举的值
                if (!Object.values(ChatRecordTaskStatus).includes(parsedJson.params.status)) {
                    throw new Error(`Invalid status: ${parsedJson.params.status}`);
                }

                // 查找对应的 ChatRecordTask
                const chatRecordTask = await prisma().chatRecordTask.findFirst({
                    where: {
                        agentTaskId: parsedJson.params.id,
                        chatRecord: {
                            chatId: updateTarget.chatId,
                            roundId: updateTarget.roundId
                        }
                    }
                });

                if (!chatRecordTask) {
                    throw new Error('ChatRecordTask not found for task update');
                }

                // 更新任务状态
                await prisma().chatRecordTask.update({
                    where: {
                        id: chatRecordTask.id
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

/**
 * Finalizes the report stream by updating database records and persisting the Yjs document state.
 *
 * This function performs the following actions:
 * 1. Retrieves a chat record for the specified chat and round with a 'user' speaker type, and if found, updates its status to COMPLETED and refreshes its update time.
 * 2. Updates the corresponding chat's update time.
 * 3. Persists the state of the provided Yjs document without clearing the history.
 * 4. Sends a "[DONE]" message to the client to signal the completion of the stream.
 *
 * Any errors encountered during the finalization process (database operations or document persistence) are logged.
 *
 * @param res - The HTTP response object used to send data to the client.
 * @param updateTarget - An object containing identifiers (chatId, roundId) and the Yjs document to be persisted.
 * @param completeMessage - A message indicating stream completion (the provided value is not directly used in the response).
 * 
 * @returns A promise that resolves when the stream end processing is complete.
 */
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

        // 在发送 [DONE] 之前进行持久化，但不清理历史记录
        try {
            await updateTarget.yDoc.persist(false);
            logger().info({
                msg: 'Successfully persisted yDoc state on stream end',
                data: {
                    chatId: updateTarget.chatId,
                    roundId: updateTarget.roundId
                }
            });
        } catch (persistError) {
            logger().error({
                msg: 'Failed to persist yDoc state on stream end',
                data: {
                    error: persistError instanceof Error ? persistError.message : 'Unknown error',
                    chatId: updateTarget.chatId,
                    roundId: updateTarget.roundId
                }
            });
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

/**
 * Handles errors during stream processing by logging the error, updating the relevant database records, and sending an error message via the response stream.
 *
 * This function logs the error details including the associated chat and round IDs. It then attempts to update the associated chat record,
 * marking any tasks in progress as failed and updating the chat record's status to error with the provided complete message. If the database update fails,
 * it logs an additional error message. Finally, it writes the error details to the response stream.
 *
 * @param error - The error encountered during stream processing; if not an instance of Error, a generic message is used.
 * @param res - The Express response object used to send Server-Sent Event (SSE) messages.
 * @param updateTarget - An object containing the chatId and roundId used to locate and update the relevant records in the database.
 * @param completeMessage - The complete message to be recorded in the chat record upon error.
 *
 * @returns A promise that resolves once the error handling process is complete.
 */
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
            },
            orderBy: {
                createdTime: 'desc'
            }
        });

        if (record) {
            await prisma().$transaction([
                // Update any running tasks to failed status
                prisma().chatRecordTask.updateMany({
                    where: {
                        chatRecordId: record.id,
                        status: ChatRecordTaskStatus.IN_PROGRESS
                    },
                    data: {
                        status: ChatRecordTaskStatus.FAILED
                    }
                }),
                // Update chat record status
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
                ErrorCode.API_ERROR,
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
                ErrorCode.API_ERROR,
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
    private pendingJsonMessage: string | null = null;
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
            try {
                if (this.pendingJsonMessage) {
                    // 处理最后一条消息，但不发送 [NEW_STEP]
                    await handleJsonContent(this.pendingJsonMessage, this.config.res, this.updateTarget, true);
                    this.pendingJsonMessage = null;
                }
                await handleStreamEnd(this.config.res, this.updateTarget, this.completeMessage);
                return true;
            } catch (error) {
                logger().error({
                    msg: 'Error handling stream end',
                    data: {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        chatId: this.config.chatId,
                        roundId: this.config.roundId
                    }
                });
                await this.handleError(error);
                return true;
            }
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
        try {
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

                // 保存当前消息为待处理消息
                if (currentJsonMessage) {
                    this.pendingJsonMessage = currentJsonMessage;
                }
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
        } catch (error) {
            logger().error({
                msg: 'Error processing content',
                data: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    chatId: this.config.chatId,
                    roundId: this.config.roundId,
                    content: content.substring(0, 100) // 只记录前100个字符
                }
            });
            throw error;
        }
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

/**
 * Handles processing of a report stream response and updates the associated Yjs document.
 *
 * This function retrieves the chat document relation from the database using the provided
 * chat ID. It then validates that a valid workspace exists in the session and, if successful,
 * obtains the Yjs document associated with the chat. A new ReportStreamProcessor is created
 * to process the fetch response stream, updating the document in real time. The function
 * throws a ValidationError if the chat document relation or a valid workspace is not found.
 *
 * @param response - The fetch response containing the report stream data.
 * @param req - The Express HTTP request object.
 * @param res - The Express HTTP response object.
 * @param chatId - The identifier of the chat whose document relation is being processed.
 * @param roundId - The identifier of the reporting round.
 * @param socketServer - The Socket.IO server instance used for real-time updates.
 * @param controller - (Optional) An AbortController instance to cancel the stream processing.
 *
 * @throws ValidationError If the chat document relation is not found.
 * @throws ValidationError If a valid workspace is not found in the session.
 */
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