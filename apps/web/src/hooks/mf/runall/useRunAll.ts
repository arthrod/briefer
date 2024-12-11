import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData, MFResponse } from '../useResponse'
import { ApproveStatus, RunAllStatus } from './useRunAllList'
export const useRunAll = () => {
  const createRunAll = useCallback(async (chatId: string, name: string) => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/run-all/run`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chatId,
        name: name
      }),
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }
    return getData<void>(res)
  }, [])
  return createRunAll
}
