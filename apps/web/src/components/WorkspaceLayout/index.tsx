import React, {
  cloneElement,
  isValidElement,
  PropsWithChildren,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Syne } from 'next/font/google'
import PagePath from '@/components/PagePath'
import { ChevronDoubleRightIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import { Page } from '@/components/PagePath'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { extractQueryParamValue, useStringQuery } from '@/hooks/useQueryArgs'
import { useSession, useSignout } from '@/hooks/useAuth'
import { isBanned } from '@/utils/isBanned'
import BannedPage from '../BannedPage'
import MobileWarning from '../MobileWarning'
import CommandPalette from '../commandPalette'
import { useHotkeys } from 'react-hotkeys-hook'

import useSideBar from '@/hooks/useSideBar'
import ToggleIcon from '@/icons/toggle.svg'
import ChatDetail from '@/components/mf/ChatDetail'
import { MessageContent } from '@/hooks/mf/chat/useChatDetail'
import ChatInput from '@/components/mf/ChatInput'

import styles from './index.module.scss'
import { useChatLayoutContext } from '../mf/ChatLayout'
import { showToast } from '../mf/Toast'

const syne = Syne({ subsets: ['latin'] })

interface Props extends PropsWithChildren {
  pagePath?: Page[]
  topBarClassname?: string
  hideOnboarding?: boolean
}

function ChatLayout() {
  const [loading, setLoading] = useState(false)
  const { roundList, stopChat, startChat } = useChatLayoutContext()
  const chatId = extractQueryParamValue('chatId')

  const router = useRouter()

  const handleSend = async (question: string) => {
    if (!question || loading) {
      return
    }
    setLoading(true)
    startChat(chatId, question)
      .catch((e) => {
        showToast('消息发送失败，请检查网络', 'error')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const handleStop = () => {
    stopChat()
      .catch((e) => {
        showToast('停止失败，请检查网络', 'error')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  return (
    <div className={clsx(styles.chatLayout)}>
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
        <ChatDetail
          roundList={roundList}
          loading={loading}
          onRegenerate={function (message: MessageContent): void {
            throw new Error('Function not implemented.')
          }}></ChatDetail>
      </div>
      <div className={styles.bottom}>
        <div className={styles.chatArea}>
          <ChatInput loading={loading} showUpload={false} onSend={handleSend} onStop={handleStop} />
        </div>
      </div>
    </div>
  )
}
export interface WorkspaceLayoutChildrenProps {
  updateTopBar?: (el: React.ReactElement) => void
}

export default function WorkspaceLayout({ children, pagePath, topBarClassname }: Props) {
  const [isSearchOpen, setSearchOpen] = useState(false)
  const [topBarContent, setTopBarContent] = useState<ReactElement | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const session = useSession()
  const router = useRouter()
  const signOut = useSignout()

  const [{ data: workspaces, isLoading: isLoadingWorkspaces }] = useWorkspaces()
  const [isSideBarOpen, setSideBarOpen] = useSideBar()

  const workspaceId = useStringQuery('workspaceId')

  useHotkeys(['mod+k'], () => {
    setSearchOpen((prev) => !prev)
  })

  const toggleSideBar = useCallback(
    (state: boolean) => {
      return () => setSideBarOpen(state)
    },
    [setSideBarOpen]
  )

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

  let modifiedChildren = children
  if (isValidElement<WorkspaceLayoutChildrenProps>(children)) {
    modifiedChildren = cloneElement(children, {
      updateTopBar: (topBar: ReactElement) => {
        setTopBarContent(topBar)
      },
    })
  }

  return (
    <div className={`flex h-full w-full`}>
      <MobileWarning />

      <CommandPalette workspaceId={workspaceId} isOpen={isSearchOpen} setOpen={setSearchOpen} />
      <div
        className={
          isSideBarOpen
            ? `flex h-full min-w-[33%] max-w-[33%] flex-col overflow-auto lg:min-w-[25%] lg:max-w-[25%]`
            : `hidden md:max-w-[0] lg:max-w-[0]`
        }>
        <ChatLayout />
      </div>

      <main
        className={clsx(
          `flex h-screen w-full flex-col ${syne.className} relative`,
          isSideBarOpen ? `md:max-w-[67%] lg:max-w-[75%]` : `md:max-w-[100%] lg:max-w-[100%]`
        )}>
        <span
          className={clsx(
            !isSideBarOpen && 'hidden',
            'bg-ceramic-50 hover:bg-ceramic-100 absolute left-0 top-[50%] z-20 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 px-0 text-gray-400 hover:cursor-pointer hover:text-gray-600'
          )}
          onClick={toggleSideBar(false)}>
          <ToggleIcon className="h-4 w-4" />
        </span>
        <div
          className={clsx(
            isSideBarOpen ? 'px-8' : 'pr-8',
            'b-1 flex h-12 w-full shrink-0 justify-between',
            topBarClassname
          )}>
          <div className="flex w-full">
            <div
              className={clsx(
                isSideBarOpen ? 'hidden' : 'mr-8',
                'bg-ceramic-50 hover:bg-ceramic-100 relative h-12 w-12 flex-shrink cursor-pointer text-gray-500'
              )}
              onClick={toggleSideBar(true)}>
              <ChevronDoubleRightIcon className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2" />
            </div>
            {pagePath && <PagePath pages={pagePath} />}
            {topBarContent}
          </div>
        </div>
        <div className="flex flex-grow overflow-hidden">{modifiedChildren}</div>
      </main>
    </div>
  )
}
