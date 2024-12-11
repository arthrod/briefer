import { useCallback } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData } from '../useResponse'

export type ColumnItem = {
  id: number
  name: string
  type: string
  comment: string
  isPrimary: boolean
}

export type ColumnList = {
  list: ColumnItem[]
}

export const useTableColumns = () => {
  const getTableColumns = useCallback(async (tableId: number) => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/schema/table/columns`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tableId
      }),
    })
    return getData<ColumnList>(res)
  }, [])
  return getTableColumns
} 