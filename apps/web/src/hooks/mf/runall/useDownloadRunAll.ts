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
export const useDownloadRunAll = () => {
  const c = useCallback(async (id: number) => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/run-all/status?=${id}`, {
      credentials: 'include',
      method: 'GET',
      headers: {
        'Content-Type': 'application/oct-stream',
      }
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }
    return getData<StatusList>(res, false)
  }, [])
  return useDownloadRunAll
}
