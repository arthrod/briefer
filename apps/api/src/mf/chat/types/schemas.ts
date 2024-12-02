import { z } from 'zod'

// 基础类型定义
const baseId = z.string().min(1, 'ID不能为空')

// 基础 Schema
const baseChatSchema = {
  chatId: baseId.describe('对话ID'),
}

const baseRoundSchema = {
  ...baseChatSchema,
  roundId: baseId.describe('对话轮次ID'),
}

// 具体业务 Schema
export const createChatSchema = z.object({
  type: z.enum(['rag', 'report']),
  fileId: z.string(),
})

export const updateChatSchema = z.object({
  id: baseId.describe('对话ID'),
  title: z.string().min(1, '标题不能为空'),
})

export const deleteChatSchema = z.object({
  id: baseId.describe('对话ID'),
})

export const createChatRoundSchema = z.object({
  question: z.string().min(1, '问题不能为空'),
  ...baseChatSchema,
})

export const getChatDetailSchema = z.object({
  id: baseId.describe('对话ID'),
})

export const updateTitleSchema = z.object({
  ...baseRoundSchema,
})

export const chatCompletionsSchema = z.object(baseRoundSchema)
export const summarizeChatSchema = z.object(baseRoundSchema)
export const getChatStatusSchema = z.object(baseChatSchema)
export const stopChatSchema = z.object({
  roundId: baseId.describe('对话轮次ID'),
})
