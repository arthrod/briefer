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
  }[]
  documentId: string | null
  file: FileInfo | null
}

export interface CachedResponse {
  code: number
  data: unknown
  msg: string
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
  related: boolean
}

export interface ErrorResponse {
  code: number
  msg: string
  data: null
}

export interface UpdateTarget {
  type: 'chat_record' | 'chat_title'
  id?: string
  chatId: string
  roundId?: string
}

// 创建聊天请求
export interface CreateChatRequest {
  type: 'rag' | 'report'
  fileId: string
}

// 创建聊天响应
export interface CreateChatResponse {
  code: number
  msg: string
  data: {
    id: string
    type: 'rag' | 'report'
    title: string
    status: number
    createdAt: string
  }
}

// 聊天列表响应
export interface ChatListResponse {
  code: number
  msg: string
  data: {
    id: string
    type: 'rag' | 'report'
    title: string
    status: number
    createdAt: string
  }[]
}

// 更新聊天请求
export interface UpdateChatRequest {
  id: string
  title: string
}

// 更新聊天响应
export interface UpdateChatResponse {
  code: number
  msg: string
  data: {
    id: string
    title: string
  }
}

// 删除聊天请求
export interface DeleteChatRequest {
  id: string
}

// 创建聊天轮次请求
export interface CreateChatRoundRequest {
  chatId: string
  question: string
}

// 创建聊天轮次响应
export interface CreateChatRoundResponse {
  code: number
  msg: string
  data: {
    id: string
    chatId: string
    question: string
  }
}

// 聊天状态请求
export interface ChatStatusRequest {
  chatId: string
}

// 聊天状态响应
export interface ChatStatusResponse {
  code: number
  msg: string
  data: {
    status: number
  }
}

// 停止聊天请求
export interface StopChatRequest {
  roundId: string
}

// 聊天完成响应
export interface ChatCompletionResponse {
  code: number
  msg: string
  data: {
    answer: string
    references?: {
      id: string
      content: string
      title: string
    }[]
  }
}

// SSE事件类型
export interface SSEEvent {
  type: 'message' | 'error' | 'complete'
  data: {
    content?: string
    message?: string
    updateTarget?: UpdateTarget
  }
}

// 获取聊天详情请求
export interface GetChatDetailRequest {
  chatId: string
}

// 获取聊天详情响应
export interface GetChatDetailResponse {
  code: number
  msg: string
  data: ChatDetailResponse
}

// 关系检查请求
export interface RelationCheckRequest {
  question: string
  fileId: string
}

// 更新标题请求
export interface UpdateTitleRequest {
  chatId: string
  roundId: string
}

// 更新标题响应
export interface UpdateTitleResponse {
  code: number
  msg: string
  data: {
    title: string
  }
}

// 聊天记录类型
export interface ChatRecord {
  id: string
  speakerType: string
  question: string
  answer: string | null
  status: number
  createdTime: Date
}

// 文件关系类型
export interface FileRelation {
  userFile: {
    id: string
    name: string
    type: string
  }
}

// 文档关系类型
export interface DocumentRelation {
  documentId: string
}

// 聊天类型
export interface Chat {
  id: string
  type: number
  title: string
  status: number
  userId: string
  createdAt: Date
  fileRelations: FileRelation[]
  records: ChatRecord[]
  documentRelations: DocumentRelation[]
}
