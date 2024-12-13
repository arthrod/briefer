import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { useCallback, useMemo } from 'react'
import { getData } from '../useResponse'

export const useDeleteChat = () => {
  const deleteChat = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/chat/delete`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: id,
      }),
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }

    return getData<void>(res)
  }, [])
  return useMemo(() => deleteChat, [deleteChat])
}
