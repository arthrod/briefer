import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData, MFResponse } from '../useResponse'

export enum RunAllStatus {
    Running = 1,
    RunSuccess,
    RunFailed,
    NotRunning,
    CodePushing,
    PushCodeFailed
}
export enum ApproveStatus {
    ApproveSuccess = 1,
    ApproveReject,
    InReview,
    NoSubmit,
    UnAble
}
export type RunAllList = {
  list: RunAllItem[]
}
export type RunAllItem = {
  id: string
  name: string
  documentId: string
  jobId: string
  runStatus: RunAllStatus
  approveStatus: ApproveStatus
  startTime: string
  endTime?: string
  duration?: string
  des: string
  version: string
  reason?: string
}

export const useRunAllList = () => {
  const getRunAllList = useCallback(async (pageNum: number, pageSize: number, documentId:string, keyword?: string) => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/run-all/list`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pageNum: pageNum,
        pageSize: pageSize,
        keyword: keyword,
      }),
    })
    // if (res.status > 299) {
    //   throw new Error(`Unexpected status ${res.status}`)
    // }
    return getData<RunAllList>(res)
  }, [])
  return getRunAllList
}
