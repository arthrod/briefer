import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData, MFResponse } from '../useResponse'
import { ApproveStatus, RunAllStatus } from './useRunAllList'
export type StatusItem = {
    id: number
    runStatus: RunAllStatus
    approveStatus: ApproveStatus
    endTime?: string
    duration: string
    failReson?: string
}
export type StatusList = { 
    list: StatusItem[]
}
export const useQueryStatus = () => {
  const getStatusList = useCallback(async (ids: number[]) => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/run-all/status`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ids: ids
      }),
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }
    return getData<StatusList>(res, false)
  }, [])
  return getStatusList
}
