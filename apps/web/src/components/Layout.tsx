import { v4 as uuidv4 } from 'uuid'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Syne } from 'next/font/google'
import PagePath from '@/components/PagePath'
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import { Page } from '@/components/PagePath'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { useStringQuery } from '@/hooks/useQueryArgs'
import { useSession, useSignout } from '@/hooks/useAuth'
import type { UserWorkspaceRole } from '@briefer/database'
import { isBanned } from '@/utils/isBanned'
import BannedPage from './BannedPage'
import MobileWarning from './MobileWarning'
import ScrollBar from './ScrollBar'
import CommandPalette from './commandPalette'
import { useHotkeys } from 'react-hotkeys-hook'

import styles from './Layout.module.scss'
import useSideBar from '@/hooks/useSideBar'
import ChatDetail from './mf/ChatDetail'
import ChatInput from './mf/ChatInput'

const syne = Syne({ subsets: ['latin'] })

interface Props {
  children: React.ReactNode
  pagePath?: Page[]
  topBarClassname?: string
  topBarContent?: React.ReactNode
  hideOnboarding?: boolean
}

export default function Layout({ children, pagePath, topBarClassname, topBarContent }: Props) {
  const session = useSession()

  const [isSearchOpen, setSearchOpen] = useState(false)
  useHotkeys(['mod+k'], () => {
    setSearchOpen((prev) => !prev)
  })

  const [isSideBarOpen, setSideBarOpen] = useSideBar()
  const toggleSideBar = useCallback(
    (state: boolean) => {
      return () => setSideBarOpen(state)
    },
    [setSideBarOpen]
  )

  const router = useRouter()
  const workspaceId = useStringQuery('workspaceId')
  const documentId = useStringQuery('documentId')

  const [{ data: workspaces, isLoading: isLoadingWorkspaces }] = useWorkspaces()

  const signOut = useSignout()
  useEffect(() => {
    const workspace = workspaces.find((w) => w.id === workspaceId)

    if (!workspace && !isLoadingWorkspaces) {
      if (workspaces.length > 0) {
        router.replace(`/workspaces/${workspaces[0].id}/documents`)
      } else {
        signOut()
      }
    }
  }, [workspaces, isLoadingWorkspaces, signOut])

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onBeforeUnload = () => {
      if (scrollRef.current) {
        localStorage.setItem(`scroll-${workspaceId}`, scrollRef.current.scrollTop.toString())
      }
    }

    router.events.on('routeChangeStart', onBeforeUnload)
    return () => {
      router.events.off('routeChangeStart', onBeforeUnload)
    }
  }, [workspaceId, scrollRef, router])
  useEffect(() => {
    const scroll = localStorage.getItem(`scroll-${workspaceId}`)
    if (scroll && scrollRef.current) {
      scrollRef.current.scrollTop = parseInt(scroll)
    }
  }, [workspaceId, scrollRef])

  const userEmail = session.data?.email
  if (userEmail && isBanned(userEmail)) {
    return <BannedPage />
  }

  return (
    <div className={`flex h-full w-full ${syne.className}`}>
      <MobileWarning />

      <CommandPalette workspaceId={workspaceId} isOpen={isSearchOpen} setOpen={setSearchOpen} />

      <div
        className={clsx(
          styles.chatLayout,
          isSideBarOpen ? `flex md:max-w-[33%] lg:max-w-[25%]` : `hidden md:max-w-[0] lg:max-w-[0]`
        )}>
        <div className={styles.top}>
          <img
            className="cursor-pointer"
            src="/icons/menu.svg"
            onClick={() => {
              router.push('/home')
            }}
            width={20}
            height={20}
            alt=""
          />
          AI助手
        </div>
        <div className={styles.middle}>
          <ChatDetail></ChatDetail>
        </div>
        <div className={styles.bottom}>
          <div className={styles.chatArea}>
            <ChatInput />
          </div>
        </div>
      </div>

      <main
        className={clsx(
          `flex h-screen w-full flex-col ${syne.className} relative`,
          isSideBarOpen ? `md:max-w-[67%] lg:max-w-[75%]` : `md:max-w-[100%] lg:max-w-[100%]`
        )}>
        <div
          className={clsx(
            isSideBarOpen ? 'px-8' : 'pr-8',
            'b-1 flex h-12 w-full shrink-0 justify-between border-b border-gray-200',
            topBarClassname
          )}>
          <span
            className={clsx(
              !isSideBarOpen && 'hidden',
              'bg-ceramic-50 hover:bg-ceramic-100 absolute left-0 z-20 flex h-6 w-6 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-gray-200 px-0 text-gray-400 hover:cursor-pointer hover:text-gray-600'
            )}
            onClick={toggleSideBar(false)}>
            <ChevronDoubleLeftIcon className="h-3 w-3" />
          </span>

          <div className="flex w-full">
            <div
              className={clsx(
                isSideBarOpen ? 'hidden' : 'mr-8',
                'bg-ceramic-50 hover:bg-ceramic-100 relative h-12 w-12 flex-shrink cursor-pointer border-b border-gray-200 text-gray-500'
              )}
              onClick={toggleSideBar(true)}>
              <ChevronDoubleRightIcon className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2" />
            </div>
            {pagePath && <PagePath pages={pagePath} />}
            {topBarContent}
          </div>
        </div>
        <div className="flex flex-grow overflow-hidden">{children}</div>
      </main>
    </div>
  )
}
