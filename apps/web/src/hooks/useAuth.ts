import { AesTools } from '@/utils/AesTools'
import { NEXT_PUBLIC_API_URL, NEXT_PUBLIC_PUBLIC_URL } from '@/utils/env'
import fetcher from '@/utils/fetcher'
import type { ApiUser, UserWorkspaceRole } from '@briefer/database'
import { useRouter } from 'next/router'
import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'

type UseAuthError = 'unexpected' | 'invalid-creds'
type AuthState = {
  loading: boolean
  data?: { email: string; loginLink?: string }
  error?: UseAuthError
}

type SignupApi = { signupWithEmail: (email: string) => void }
type UseSignup = [AuthState, SignupApi]
export const useSignup = (): UseSignup => {
  const [state, setState] = useState<{
    loading: boolean
    data?: { email: string }
    error?: 'unexpected'
  }>({
    loading: false,
    data: undefined,
    error: undefined,
  })

  const signupWithEmail = useCallback(
    (email: string) => {
      setState((s) => ({ ...s, loading: true }))
      fetch(`${NEXT_PUBLIC_API_URL()}/auth/sign-up/email`, {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          callback: NEXT_PUBLIC_PUBLIC_URL(),
        }),
      })
        .then(async (res) => {
          if (res.ok) {
            setState({
              loading: false,
              data: await res.json(),
              error: undefined,
            })
            return
          }

          throw new Error(`Unexpected status ${res.status}`)
        })
        .catch(() => {
          setState((s) => ({ ...s, loading: false, error: 'unexpected' }))
        })
    },
    [setState]
  )

  return useMemo(() => [state, { signupWithEmail }], [state, signupWithEmail])
}

type LoginAPI = {
  loginWithPassword: (username: string, password: string) => void
}
type UseLogin = [AuthState, LoginAPI]
export const useLogin = (): UseLogin => {
  const [state, setState] = useState<AuthState>({
    loading: false,
    data: undefined,
    error: undefined,
  })

  const loginWithPassword = useCallback(
    (username: string, password: string) => {
      setState((s) => ({ ...s, loading: true }))
      fetch(`${NEXT_PUBLIC_API_URL()}/auth/sign-in/password`, {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginName: username, password: AesTools.encrypt(password) }),
      })
        .then(async (res) => {
          if (res.ok) {
            setState({
              loading: false,
              data: await res.json(),
              error: undefined,
            })
            localStorage.setItem('username', username)
            return
          }

          if (res.status === 400) {
            setState({
              loading: false,
              error: 'invalid-creds',
            })
            return
          }

          throw new Error(`Unexpected status ${res.status}`)
        })
        .catch(() => {
          setState((s) => ({ ...s, loading: false, error: 'unexpected' }))
        })
    },
    [setState]
  )

  return useMemo(() => [state, { loginWithPassword }], [state])
}

export type SessionUser = ApiUser & {
  userHash: string
  roles: Record<string, UserWorkspaceRole>
}

export const useSession = () => 
  useSWR<SessionUser>(`${NEXT_PUBLIC_API_URL()}/auth/session`, fetcher)

export const useSignout = () => {
  const router = useRouter()
  return useCallback(
    (callback?: string) => {
      const cb = callback ?? NEXT_PUBLIC_PUBLIC_URL()
      router.push(`${NEXT_PUBLIC_API_URL()}/auth/logout?callback=${encodeURIComponent(cb)}`)
    },
    [router]
  )
}
