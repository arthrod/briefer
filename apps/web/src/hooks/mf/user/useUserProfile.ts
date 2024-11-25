import { useCallback } from 'react'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { getData } from '../useResponse'

export type UserProfile = {
  email: string
  nickname: string
  phone: string
  role: string
  username: string
}

export const useUserProfile = () => {
  const getUserProfile = useCallback(async () => {
    const res = await fetch(`${NEXT_PUBLIC_MF_API_URL()}/user/profile`, {
      credentials: 'include',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    return getData<UserProfile>(res)
  }, [])
  return getUserProfile
}
