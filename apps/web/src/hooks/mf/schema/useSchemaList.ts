import { useCallback, useMemo } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData, MFResponse } from '../useResponse'

export type TableList = {
  list: TableItem[]
}
export type TableItem = {
  id: number
  name: string
  tableName: string
  schemaName: string
  cnName: string
  dataSource: string
  des: string
  colNum: number
  rowNum: number
}

export const useSchemaList = () => {
  const getSchemaList = useCallback(async (pageNum: number, pageSize: number, keyword?: string) => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/schema/table/list`, {
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
    return getData<TableList>(res)
  }, [])
  return getSchemaList
}
