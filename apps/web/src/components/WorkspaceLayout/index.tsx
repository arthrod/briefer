import React, {
  cloneElement,
  isValidElement,
  PropsWithChildren,
  ReactElement,
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
import { useStringQuery, getQueryParam } from '@/hooks/useQueryArgs'
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
import { ChatStatus, useChatStatus } from '@/hooks/mf/chat/useChatStatus'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'
import ChatListBox from '../mf/ChatList'
import FileIcon from '@/icons/file.svg'

const syne = Syne({ subsets: ['latin'] })

interface Props extends PropsWithChildren {
  pagePath?: Page[]
  topBarClassname?: string
  hideOnboarding?: boolean
}

function ChatDetailLayout({ chatId, workspaceId }: { chatId: string; workspaceId: string }) {
  const [loading, setLoading] = useState(false)
  const {
    generating,
    fileInfo,
    roundList,
    setRoundList,
    refreshRoundList,
    stopChat,
    startRoundChat,
  } = useChatLayoutContext()
  const timer = useRef(-1)
  const getChatStatus = useChatStatus()

  useEffect(() => {
    setLoading(false)
    watchStatus()
    if (chatId) {
      refreshRoundList(chatId)
    }
    return () => {
      window.clearTimeout(timer.current)
    }
  }, [chatId])

  const watchStatus = () => {
    if (loading) {
      return
    }
    setLoading(true)
    timer.current = window.setTimeout(() => {
      getChatStatus(chatId)
        .then((data: ChatStatus) => {
          if (data) {
            if (data.status === 'chatting') {
              watchStatus()
            } else {
              setLoading(false)
            }
            const lastAnswer = data.answers[data.answers.length - 1]
            if (lastAnswer) {
              setRoundList((prevList) => {
                const lastIndex = prevList.length - 1 // 获取最后一条消息的索引
                const updatedList = [...prevList]
                if (lastIndex >= 0 && updatedList[lastIndex]) {
                  const lastItem = updatedList[lastIndex]
                  lastItem.content = lastAnswer.content
                }
                return updatedList
              })
            }
          }
        })
        .catch(() => {
          setLoading(false)
        })
    }, 2000)
  }
  const handleSend = async (question: string) => {
    if (!question || loading) {
      return
    }
    setLoading(true)
    startRoundChat(chatId, question, () => {
      setLoading(false)
    }).catch((e) => {
      showToast('消息发送失败，请检查网络', 'error')
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
        <Sheet>
          <SheetTrigger>
            <img className="cursor-pointer" src="/icons/menu.svg" width={20} height={20} alt="" />
          </SheetTrigger>
          <SheetContent className="w-[240px]" side="left" hideCloseButton>
            <SheetHeader>
              <SheetTitle></SheetTitle>
              <SheetDescription style={{ display: 'none' }}></SheetDescription>
            </SheetHeader>
            <ChatListBox workspaceId={workspaceId} chatId={chatId} />
          </SheetContent>
        </Sheet>
        AI助手
      </div>
      <div className={styles.middle}>
        <ChatDetail
          type="report"
          roundList={roundList}
          generating={generating}
          onRegenerate={function (message: MessageContent): void {}}></ChatDetail>
      </div>
      <div className={styles.bottom}>
        {fileInfo ? (
          <div className={clsx(styles.fileBox, 'text-sm')}>
            <FileIcon />
            <span className={styles.fileName}>{fileInfo.name}</span>
          </div>
        ) : null}
        <div className={styles.chatArea}>
          <ChatInput
            chatType="report"
            loading={loading}
            showUpload={false}
            onSend={handleSend}
            onStop={handleStop}
          />
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
  const chatId = getQueryParam('chatId')

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
        style={{ boxShadow: '0px 2px 4px 0px rgba(0, 0, 0, 0.04)' }}
        className={
          isSideBarOpen
            ? `flex h-full min-w-[33%] max-w-[33%] flex-col overflow-hidden lg:min-w-[25%] lg:max-w-[25%]`
            : `hidden md:max-w-[0] lg:max-w-[0]`
        }>
        <ChatDetailLayout workspaceId={workspaceId} chatId={chatId} />
      </div>

      <main
        className={clsx(
          `relative flex h-screen w-full flex-col`,
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
            'b-1 flex h-[3.75rem] w-full min-w-[850px] shrink-0 justify-between',
            topBarClassname
          )}>
          <div className="flex w-full">
            <div
              className={clsx(
                isSideBarOpen ? 'hidden' : '',
                'bg-ceramic-50 hover:bg-ceramic-100 relative h-[3.75rem] w-[3.75rem] flex-shrink cursor-pointer text-gray-500'
              )}
              onClick={toggleSideBar(true)}>
              <ChevronDoubleRightIcon className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2" />
            </div>
            {pagePath && <PagePath pages={pagePath} />}
            {topBarContent}
          </div>
        </div>
        <div className="flex min-w-[850px] flex-grow overflow-hidden">{modifiedChildren}</div>
      </main>
    </div>
  )
}
