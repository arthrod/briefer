import fetcher from '@/utils/fetcher'
import type {
  ApiUser,
  UserWorkspaceRole,
  WorkspaceUser,
} from '@briefer/database'
import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import type { UserFormValues } from '@/components/forms/user'
import { NEXT_PUBLIC_API_URL } from '@/utils/env'

type UpdateUserPayload = {
  name?: string
  role?: UserWorkspaceRole
  currentPassword?: string
  newPassword?: string
}
type API = {
  createUser: (
    payload: UserFormValues
  ) => Promise<ApiUser & { password?: string }>
  updateUser: (
    id: string,
    payload: UpdateUserPayload
  ) => Promise<null | 'invalid-payload' | 'forbidden' | 'incorrect-password'>
  removeUser: (id: string) => void
  resetPassword: (id: string) => Promise<string>
}

type UseUsers = [WorkspaceUser[], API]

export type HistoryChat = {
  name: string;
  id: number;
}
export const useChats = () => {

  const getChatList = useCallback(
    async () => {
      const res = await fetch(
        `${NEXT_PUBLIC_API_URL()}/mf/chat/list`,
        {
          credentials: 'include',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      )
      if (res.status > 299) {
        throw new Error(`Unexpected status ${res.status}`)
      }

      const user = await res.json()
    
      return user
    },
    []
  )
  return useMemo(
    () => [{ getChatList }],
    [getChatList]
  )
}
