import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData, MFResponse } from '../useResponse'

export type ChatType = 'rag' | 'report'
export type ChatList = {
  list: HistoryChat[]
}
export type HistoryChat = {
  id: string
  title: string
  type: ChatType
  createdTime: string
  documentId?: string
  isEditing?: boolean
}

export const useChatList = () => {
  const getChatList = useCallback(async () => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/chat/list`, {
      credentials: 'include',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }
    return getData<ChatList>(res)
  }, [])
  return useMemo(() => [{ getChatList }], [getChatList])
}
