import { ChangeEventHandler, FormEventHandler, useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useLogin, useSession } from '@/hooks/useAuth'
import Link from 'next/link'
import Spin from '@/components/Spin'
import Cookies from 'js-cookie'
import useProperties from '@/hooks/useProperties'

export default function Login() {
  const properties = useProperties()
  const router = useRouter()
  const session = useSession()
  const tokenExists = Cookies.get('sessionExpiry')

  useEffect(() => {
    if (session.data && tokenExists) {
      router.replace('/')
    }
  }, [session])

  const [username, setUsername] = useState('')
  const onChangeEmail: ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      setUsername(e.target.value)
    },
    [setUsername]
  )

  const [password, setPassword] = useState('')
  const onChangePassword: ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      setPassword(e.target.value)
    },
    [setPassword]
  )

  const [auth, { loginWithPassword }] = useLogin()

  const onPasswordAuth: FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault()

      loginWithPassword(username, password)
    },
    [username, password]
  )

  useEffect(() => {
    if (properties.data?.needsSetup) {
      router.replace('/setup')
    }
  }, [properties, router])

  useEffect(() => {
    if (auth.data?.loginLink) {
      router.push(auth.data.loginLink)
    }
  }, [auth.data, router])

  if (!properties.data) {
    if (properties.isLoading) {
      return null
    }

    return <h4>Something went wrong. Please try again or contact support.</h4>
  }

  return (
    <div className="w-100vw relative h-full overflow-hidden">
      <img
        className="t-0 l-0 absolute opacity-10"
        src="/images/zebra-pattern.svg"
        alt="background pattern"
      />
      <div className="font-syne bg-ceramic-100/90 relative flex h-full items-center justify-center sm:justify-around">
        <div className="">
          <h1 className="font-trap text-hunter-950 text-7xl font-bold leading-[6rem] tracking-tight lg:text-[96px]">
            DataAgent
          </h1>
          <p className="text-hunter-900 pl-1 text-lg lg:text-2xl">
            The collaborative data platform.
          </p>
        </div>

        {/*
         * This padding must match the sum of the paddings of the messages at
         * the bottom of the box so that the box is centered with the logo on
         * the left.
         */}
        <div className="pt-12">
          <div className={clsx(auth.error ? 'visible' : 'hidden', 'py-8')}>
            <div className="bg-ceramic-50 rounded-sm border border-red-300 py-4 shadow sm:w-[380px] lg:w-[480px]">
              <div className="text-md text-center text-red-700">
                {auth.error === 'unexpected' && 'Something went wrong. Please contact support.'}
                {auth.error === 'invalid-creds' && 'Invalid credentials. Please try again.'}
              </div>
            </div>
          </div>

          <div
            className={clsx(
              'bg-ceramic-50 flex flex-col rounded-lg p-12 shadow sm:w-[380px] lg:w-[480px]',
              'gap-y-6'
            )}>
            <h2 className="text-hunter-900 text-4xl font-bold tracking-tight">登录</h2>

            <form onSubmit={onPasswordAuth}>
              <div>
                <div className="pb-4">
                  <label htmlFor="username" className="block pb-2 text-sm leading-6 text-gray-500">
                    用户名
                  </label>
                  <div>
                    <input
                      name="username"
                      type="text"
                      disabled={auth.data !== undefined || auth.loading}
                      required
                      value={username}
                      onChange={onChangeEmail}
                      className="block w-full rounded-md border-0 py-2 text-sm leading-6 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-600 disabled:cursor-not-allowed disabled:bg-gray-100"
                    />
                  </div>
                </div>

                <div className="pb-4">
                  <label htmlFor="username" className="block pb-2 text-sm leading-6 text-gray-500">
                    密码
                  </label>
                  <div>
                    <input
                      name="password"
                      type="password"
                      autoComplete="password"
                      disabled={auth.data !== undefined || auth.loading}
                      required
                      value={password}
                      onChange={onChangePassword}
                      className="block w-full rounded-md border-0 py-2 text-sm leading-6 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-gray-600 disabled:cursor-not-allowed disabled:bg-gray-100"
                    />
                  </div>
                </div>

                <div className={clsx('pt-3')}>
                  <button
                    type="submit"
                    disabled={auth.data !== undefined || auth.loading}
                    className={clsx(
                      'bg-primary-200 hover:bg-primary-300 flex w-full items-center justify-center rounded-sm px-6 py-3 text-sm font-medium shadow-sm disabled:bg-gray-200 disabled:hover:cursor-not-allowed'
                    )}>
                    <span>登录</span>
                    {auth.loading && <Spin wrapperClassName="pl-2" />}
                  </button>
                </div>
              </div>
            </form>
          </div>
          <div className="pt-8 text-center text-slate-500">
            <p className="text-xs text-slate-500">
              By logging in, you agree to our{' '}
              <Link
                href="https://briefer.cloud/terms-and-conditions"
                target="_blank"
                className="underline hover:text-gray-900">
                Terms and Conditions
              </Link>{' '}
              and{' '}
              <Link
                href="https://briefer.cloud/privacy"
                target="_blank"
                className="underline hover:text-gray-900">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
