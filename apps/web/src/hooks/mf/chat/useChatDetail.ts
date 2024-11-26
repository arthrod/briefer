import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData } from '../useResponse'

export type ChatType = 'rag' | 'report'
export type MessageRoleType = 'system' | 'user' | 'assistant'
export type ReportFileType = 'word' | 'pdf'

export type ReportFileData = {
  id: string
  name: string
  type: ReportFileType
}

export type ReportDetailData = {
  type: ChatType
  messages: MessageContent[]
  documentId?: string
  file: ReportFileData
}

export type MessageContent = {
  id: string
  role: MessageRoleType
  content: string
  isError?: boolean
  roundId?: string
}

export type RagDetailData = {
  type: ChatType
  messages: MessageContent[]
}

export type ChatDetail = {
  code: number
  data: ReportFileData | RagDetailData
  msg: string
}

export const useChatDetail = () => {
  const getChatDetail = useCallback(async <T>(id: string, type?: ChatType): Promise<T> => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/chat/detail`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: id,
      }),
    })

    return getData<T>(res) as T
  }, [])
  return getChatDetail
}
