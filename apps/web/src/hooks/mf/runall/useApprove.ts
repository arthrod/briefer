import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData, MFResponse } from '../useResponse'
import { ApproveStatus, RunAllStatus } from './useRunAllList'
export const useApprove = () => {
  const requestApprove = useCallback(async (id: number) => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/run-all/approve`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: id
      }),
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }
    return getData<void>(res)
  }, [])
  return requestApprove
}
