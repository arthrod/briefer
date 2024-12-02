import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData } from '../useResponse'
import { HistoryChat } from './useChatList'

export type ChatType = 'rag' | 'report'
export type MessageRoleType = 'system' | 'user' | 'assistant'
export type ReportFileType = 'word' | 'pdf'

export const useChatCreate = () => {
  const createChat = useCallback(async (type: ChatType, fileId?: string) => {
    const res: Response = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/chat/create`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: type,
        fileId: fileId,
      }),
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }

    return getData<HistoryChat>(res)
  }, [])
  return createChat
}
