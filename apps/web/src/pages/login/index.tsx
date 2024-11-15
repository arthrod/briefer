import { ChangeEventHandler, FormEventHandler, useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useLogin, useSession } from '@/hooks/useAuth'
import Link from 'next/link'
import Spin from '@/components/Spin'
import Cookies from 'js-cookie'
import useProperties from '@/hooks/useProperties'
import styles from './index.module.scss'
import { Icon } from 'lucide-react'
import AccountSvg from '../../icons/login_account.svg'
import PwdSvg from '../../icons/logn_pwd.svg'
import MindFlowSvg from '../../icons/mind-flow.svg'
import { Checkbox } from '@/components/mf/Checkbox/Checkbox'
import { CheckedState } from '@radix-ui/react-checkbox'

export default function Login() {
  const properties = useProperties()
  const router = useRouter()
  const session = useSession()
  const tokenExists = Cookies.get('sessionExpiry')
  const [remePwd, setRemePwd] = useState<boolean | 'indeterminate'>(false)
  useEffect(() => {
    const value = localStorage.getItem('remePwd');
    const username = localStorage.getItem('username') || '';
    const booleanValue = value === 'true';
    setRemePwd(booleanValue);
    if (value) {
      setUsername(username)
    }
  },[])
  const onChangeChecked = useCallback((checked: CheckedState) => {
    setRemePwd(checked);
    localStorage.setItem('remePwd', checked.toString())
  }, [])
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
      // router.replace('/setup')
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
    <div
      className={clsx('w-100vw relative h-full overflow-hidden', styles.login_home)}>
      <MindFlowSvg
      className={styles.mindflow_icon}
      ></MindFlowSvg>
      <div className={styles.content}>

        {/*
         * This padding must match the sum of the paddings of the messages at
         * the bottom of the box so that the box is centered with the logo on
         * the left.
         */}
        <div>
          <div className={clsx(auth.error ? 'visible' : 'hidden', 'py-8', 'flex')}>
            <div className="bg-ceramic-50 rounded-sm border border-red-300 py-4 sm:w-[380px] lg:w-[480px]">
              <div className="text-md text-center text-red-700">
                {auth.error === 'unexpected' && 'Something went wrong. Please contact support.'}
                {auth.error === 'invalid-creds' && '用户名或密码错误'}
              </div>
            </div>
          </div>

          <div
            className={clsx(
              'flex flex-col rounded-lg',
              styles.form
            )}>
            <h2 className="text-hunter-900 text-4xl font-bold tracking-tight">登录</h2>

            <form onSubmit={onPasswordAuth} className='mt-[16px]'>
              <div>
                <div className={clsx('pb-4')}>
                  <label htmlFor="username" className="block pb-2 text-sm leading-6 text-gray-500">
                    帐号
                  </label>
                  <div className={styles.input_layout}>
                    <AccountSvg className={styles.icon} />
                    <input
                      name="username"
                      type="text"
                      className={styles.input}
                      disabled={auth.data !== undefined || auth.loading}
                      required
                      value={username}
                      onChange={onChangeEmail}
                      placeholder="请输入帐号"
                    />
                  </div>
                </div>

                <div className={clsx('mt-[28px]')}>
                  <label htmlFor="username" className="block pb-2 text-sm leading-6 text-gray-500">
                    密码
                  </label>
                  <div className={styles.input_layout}>
                    <PwdSvg className={styles.icon}></PwdSvg>
                    <input
                      name="password"
                      type="password"
                      autoComplete="password"
                      placeholder="请输入密码"
                      disabled={auth.data !== undefined || auth.loading}
                      required
                      value={password}
                      onChange={onChangePassword}
                      className={styles.input}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2 mt-[18px]">
                  <Checkbox id="terms" checked={remePwd} onCheckedChange={onChangeChecked}/>
                  <label
                    htmlFor="terms"
                    className={clsx("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                      styles.checkbox
                  
                    )}>
                    记住密码
                  </label>
                </div>
                <div className={clsx('mt-[44px]')}>
                  <button
                    type="submit"
                    disabled={auth.data !== undefined || auth.loading}
                    className={clsx(
                      styles.botton,
                      'flex w-full items-center justify-center rounded-sm px-6 py-3 text-sm font-medium shadow-sm disabled:bg-gray-200 disabled:hover:cursor-not-allowed'
                    )}>
                    <span>登录</span>
                    {auth.loading && <Spin wrapperClassName="pl-2" />}
                  </button>
                </div>
              </div>
            </form>
          </div>
          {/* <div className="pt-8 text-center text-slate-500">
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
          </div> */}
        </div>
      </div>
    </div>
  )
}
