import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData, MFResponse } from '../useResponse'

export type ChatRoundCreateData = {
  id: string
}

export const useChatRoundCreate = () => {
  const createChatSession = useCallback(async (question: string, chatId: string) => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/chat/round/create`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: question,
        chatId: chatId,
      }),
    })
    return getData<ChatRoundCreateData>(res)
  }, [])
  return useMemo(() => createChatSession, [createChatSession])
}
