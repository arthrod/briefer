import { UserWorkspaceRole } from '@prisma/client'
import { Response } from 'express'
import { Send } from 'express-serve-static-core'
import { z } from 'zod'

export interface FileInfo {
  id: string
  name: string
  type: string
}

export interface ChatDetailResponse {
  type: 'rag' | 'report'
  messages: {
    id: string
    role: string
    content: string
    status?: 'success' | 'error' | 'chatting'
  }[]
  documentId: string | null
  file: FileInfo | null
}

export interface CachedResponse {
  code: number
  data: unknown
  msg: string
}

export interface ExtendedResponse extends Response {
  sendResponse: Send<any, Response>
}

export interface Message {
  id: string
  role: string
  content: string
}

export interface RelationCheckResponse {
  code: number
  msg: string
  data: {
    related: boolean
  }
}

export interface ErrorResponse {
  code: number
  msg: string
  data: null
}

export interface UpdateTarget {
  type: 'chat_record' | 'chat_title'
  chatId: string
  roundId?: string
}

export interface MockSession {
  user: {
    id: string
    status: number
    name: string
    loginName: string
    email: string
    picture: string
    phone: string
    nickname: string
    createdAt: Date
    updatedAt: Date
    isDeleted: boolean
  }
  userWorkspaces: {
    default: {
      workspaceId: string
      userId: string
      createdAt: Date
      updatedAt: Date
      inviterId: null
      role: UserWorkspaceRole
    }
  }
}

// Schema 定义
export const baseId = z.string().min(1, 'ID不能为空')

export const baseChatSchema = {
  chatId: baseId.describe('对话ID'),
}

export const baseRoundSchema = {
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

export const chatCompletionsSchema = z.object(baseRoundSchema)
export const summarizeChatSchema = z.object(baseRoundSchema)
export const getChatStatusSchema = z.object(baseChatSchema)

export const stopChatSchema = z.object({
  roundId: baseId.describe('对话轮次ID'),
})