import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { useCallback, useMemo } from 'react'
import { getData } from '../useResponse'

export type ChatStatus = {
  status: 'idle' | 'chatting'
  roundId?: string
}
export const useChatStatus = () => {
  const getChatStatus = useCallback(async (id: string): Promise<ChatStatus> => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/chat/status`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: id,
      }),
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }

    return getData<ChatStatus>(res)
  }, [])
  return useMemo(() => getChatStatus, [getChatStatus])
}
