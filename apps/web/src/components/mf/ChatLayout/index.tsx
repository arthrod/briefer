import { ChatList, HistoryChat, useChatList } from '@/hooks/mf/chat/useChatList'
import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useRouter } from 'next/router'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NoData } from '@/components/mf/NoData'

import styles from './index.module.scss'
import ScrollBar from '@/components/ScrollBar'

import Logo from '../../../icons/mind-flow.svg'
import { useSession } from '@/hooks/useAuth'
interface Item {
  type: string
  label: string
}

interface IMoreBtnProps {
  items: Item[]
  onItemClick?: (type: string) => void
}

interface ChatLayoutContextType {
  newChat: (chat: HistoryChat, msg: string) => void
  refreshChatList: () => void
  getScope: () => string
  startRound: (chatId: string, roundId: string) => ChatSession
  getRound: (roundId: string) => ChatSession | undefined
  endRound: (roundId: string) => void;
}
export const ChatLayoutContext = createContext<ChatLayoutContextType | null>(null)
export const useChatLayout = () => {
  const context = useContext(ChatLayoutContext)
  if (!context) {
    throw new Error('useChatLayout must be used within ChatLayoutProvider')
  }
  return context
}
const MoreBtn = (props: IMoreBtnProps) => {
  const { items, onItemClick } = props
  return (
    <Popover>
      <PopoverTrigger
        className={styles.moreOpt}
        asChild
        onClick={(e) => {
          e.stopPropagation()
        }}>
        <img src="/icons/more.svg" width={16} />
      </PopoverTrigger>
      <PopoverContent>
        <div>
          {items.map((item, index) => (
            <div
              key={index}
              onClick={() => {
                onItemClick && onItemClick(item.type)
              }}>
              {item.label}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface Props {
  children: React.ReactNode
}

export type ChatSession = {
  chatId: string
  roundId: string
  content: string
  listener: EventListener
  eventSource: EventSource
}

export type EventListener = {
  onopen?: () => void
  onmessage?: (event: MessageEvent) => void
  onerror?: (error: Event) => void
  close: () => void
}
export default function ChatLayout({ children }: Props) {
  const [chatList, setChatList] = useState<HistoryChat[]>([])
  const [workspaces] = useWorkspaces()
  const [chatSession, setChatSession] = useState<ChatSession[]>([])
  const [updateTitleEvent, setUpdateTitleEvent] = useState<EventSource | null>(null)
  const lastedEvent = useRef<EventSource | null>(updateTitleEvent)
  const [eventTimeoutId, setEventTimeoutId] = useState<number>(-1)
  const lastedTimeoutId = useRef<number>(eventTimeoutId)

  const router = useRouter()
  const chatId = router.query.chatId // 获取当前路由的 chatId
  let scope = '';
  const session = useSession()
  const firstLetter = session.data?.loginName.charAt(0).toUpperCase(); // 获取用户名的第一个字母并转为大写

  const newChat = useCallback((chat: HistoryChat, msg: string) => {
    setChatList((prevChatList) => [chat, ...prevChatList]);
    scope = msg;
  }, [])
  const getScope = useCallback(() => {
    const msg = scope;
    scope = '';
    return msg;
  }, [])
  const refreshChatList = useCallback(() => {
    handleUpdate();
  }, [])
  const getRound = useCallback((roundId: string) => {
    for (let i = 0; i < chatSession.length; i++) {
      if (chatSession[i].roundId === roundId) {
        return chatSession[i];
      }
    }
  }, [])
  const endRound = useCallback((roundId: string) => {
    const chatSession = getRound(roundId)
    if (chatSession) {
      chatSession.eventSource.close()
    }
  }, [])
  const startRound = useCallback((chatId: string, roundId: string) => {

    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/mf/chat/completions?chatId=${chatId}&roundId=${roundId}`,
      {
        withCredentials: true // 如果需要发送 cookies
      }
    )
    const listener: EventListener = {
      close: () => {
        eventSource.close();
      }
    }
    const chatSession = {
      chatId: chatId,
      roundId: roundId,
      content: '',
      listener: listener,
      eventSource: eventSource
    }
    setChatSession((sessions) => [...sessions, chatSession])
    eventSource.onopen = () => {
      if (listener.onopen) {
        listener.onopen();
      }
    }
    // 处理消息
    eventSource.onmessage = (event: MessageEvent) => {
      if (listener.onmessage) {
        listener.onmessage(event)
      }
    }

    // 处理错误
    eventSource.onerror = (error) => {
      if (listener.onerror) {
        listener.onerror(error)
      }
      eventSource.close()
    }

    // 处理连接关闭
    eventSource.addEventListener('done', () => {
      eventSource.close()
    })

    return chatSession;
  }, [])

  const [{ getChatList }] = useChatList()
  useEffect(() => {
    handleUpdate()
    titleUpdate();
    return () => {
      if (lastedEvent.current) {
        lastedEvent.current.close()
      }
    }
  }, [])
  useEffect(() => {
    lastedTimeoutId.current = eventTimeoutId;
  }, [eventTimeoutId])
  useEffect(() => {
    lastedEvent.current = updateTitleEvent;
  }, [updateTitleEvent])
  useEffect(() => {
    lastedEvent.current = updateTitleEvent;
  }, [updateTitleEvent])
  const titleUpdate = useCallback((timeoutId?: number) => {
    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/mf/chat/title/update`,
      {
        withCredentials: true // 如果需要发送 cookies
      }
    )
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        setChatList((prevList) => {
          const lastIndex = prevList.findIndex((item) => item.id === data.chatId); // 获取最后一条消息的索引
          const updatedList = [...prevList];
          if (lastIndex >= 0) {
            updatedList[lastIndex] = {
              ...updatedList[lastIndex],
              title: updatedList[lastIndex].title = data.title // 将新内容追加到最后一条消息
            };
          }
          return updatedList;
        });
      } catch (e) {

      }
    }
    eventSource.onerror = (error) => {
      eventSource.close()
      const timeoutId = window.setTimeout(() => {
        titleUpdate();
      }, 5000)
      setEventTimeoutId(timeoutId)
    }
    setUpdateTitleEvent(eventSource)
  }, [chatList])

  const handleUpdate = () => {
    getChatList().then((data: ChatList) => {
      setChatList(data.list)
    })
  }
  return (
    <ChatLayoutContext.Provider value={{
      newChat,
      refreshChatList,
      getScope,
      getRound,
      endRound,
      startRound
    }}>
      <div className={clsx(styles.chatLayout)}>
        <div className={clsx(styles.left, 'text-sm')}>
          <div className={clsx("flex w-full flex-col", styles.logo_icon)} onClick={() => {
            router.push('/home')
          }}>
            <Logo />
          </div>
          <div
            className={styles.createBtn}
            onClick={() => {
              router.push(`/home`)
            }}>
            <img src="/icons/chat-new-line.svg" width={16} height={16} />
            <span>新建对话</span>
          </div>
          <ScrollBar className={styles.chatListWrapper}>
            {chatList.length ? (
              chatList.map((item) => {
                const isActive = item.id === chatId // 判断是否是当前选中项
                return (
                  <div
                    key={item.id}
                    className={clsx(styles.chatItem, {
                      [styles.chatItem_active]: isActive // 添加选中样式
                    })}
                    onClick={() => {
                      if (item.type === 'report') {
                        router.replace(`/workspaces/${workspaces.data[0].id}/documents`)
                      } else {
                        router.push(`/rag/${item.id}`)
                      }
                    }}>
                    <div className={'w-[85%] overflow-hidden text-ellipsis text-nowrap break-keep'}>
                      {item.title}
                    </div>
                    <MoreBtn
                      items={[
                        { type: 'edit', label: '编辑标题' },
                        { type: 'del', label: '删除' },
                      ]}
                      onItemClick={(type) => {
                        console.log(type)
                      }}
                    />
                  </div>
                )
              })
            ) : (
              <NoData className={styles.empty} />
            )}
          </ScrollBar>
        </div>
        <div className={styles.main}>
          <div className={styles.title}>
            <div className={styles.userAvatar} onClick={() => {
              //todo 个人中心
            }}>
              {firstLetter}
            </div>
          </div>
          {children}
        </div>
      </div>
    </ChatLayoutContext.Provider>
  )
}
