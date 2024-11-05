import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_API_URL } from '@/utils/env'

export type ChatType = 'rag' | 'report'

export type HistoryChat = {
  id: number
  title: string
  type: ChatType
  createdTime: string
}

export const useChatList = () => {
  const getChatList = useCallback(async () => {
    const res = await fetch(`${NEXT_PUBLIC_API_URL()}/mf/chat/list`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    if (res.status > 299) {
      throw new Error(`Unexpected status ${res.status}`)
    }

    const list = await res.json()

    return list
  }, [])
  return useMemo(() => [{ getChatList }], [getChatList])
}
