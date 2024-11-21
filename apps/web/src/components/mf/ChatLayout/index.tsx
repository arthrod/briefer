import { ChatList, HistoryChat, useChatList } from '@/hooks/mf/chat/useChatList'
import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useRouter } from 'next/router'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { NoData } from '@/components/mf/NoData'

import styles from './index.module.scss'
import ScrollBar from '@/components/ScrollBar'

import Logo from '../../../icons/mind-flow.svg'
import { useSession } from '@/hooks/useAuth'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/Dialog'
import { useDeleteChat } from '@/hooks/mf/chat/useChatDelete'
import { showToast } from '../Toast'
import { useChatEdit } from '@/hooks/mf/chat/useChatEdit'
import Spin from '@/components/Spin'
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
  getCache: () => string
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
  const { items, onItemClick } = props;
  const [isOpen, setIsOpen] = useState(false)
  const closePopover = () => {
    setIsOpen(false) // 手动关闭 Popover
  }
  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <PopoverButton as='div' className={styles.moreOpt}
            onClick={() => setIsOpen(!open)}
          >
            <img src="/icons/more.svg" width={16} />
          </PopoverButton>
          <PopoverPanel
            anchor="bottom"
            className={clsx('shadow-lg', styles.morePopoverLayout)}
            style={{ marginTop: '8px' }}
          >
            <div className={styles.moreBtnLayout}>
              {items.map((item, index) => (
                item.type === 'del' ?
                  <AlertDialog key={index}>
                    <AlertDialogTrigger className='w-[100%]'
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className={styles.moreBtn}
                        key={index}
                      >
                        {item.label}
                      </div>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>删除对话</AlertDialogTitle>
                        <AlertDialogDescription>
                          确定删除该对话么？
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault();
                          close()
                        }}>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault();
                          close()
                          onItemClick && onItemClick(item.type);
                        }}>确定</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog> :
                  <div
                    className={styles.moreBtn}
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault();
                      close()
                      onItemClick && onItemClick(item.type);
                    }}
                  >
                    {item.label}
                  </div>
              ))}
            </div>
          </PopoverPanel>
        </>
      )}
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
  const [chatId, setChatId] = useState('')
  const lastedTimeoutId = useRef<number>(eventTimeoutId)
  const [cache, setCache] = useState<string>('')
  const [currentTitle, setCurrentTitle] = useState<string>('')
  const [isCommit, setIsCommit] = useState<boolean>(false)
  const router = useRouter()
  const session = useSession()
  const firstLetter = session.data?.loginName.charAt(0).toUpperCase(); // 获取用户名的第一个字母并转为大写

  const newChat = useCallback((chat: HistoryChat, msg: string) => {
    setChatList((prevChatList) => [chat, ...prevChatList]);
    setCache(msg);
  }, [cache])
  const getCache = useCallback(() => {
    const msg = cache;
    setCache('')
    return msg;
  }, [cache])
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
    setChatId(String(router.query.chatId))
    handleUpdate()
    titleUpdate();
    return () => {
      if (lastedEvent.current) {
        lastedEvent.current.close()
      }
    }
  }, [])
  useEffect(() => {
    setChatId(String(router.query.chatId))
  }, [router])
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

  const [{ deleteChat }] = useDeleteChat();
  const deleteChatById = (id: string) => {
    deleteChat(id).then(() => {
      setChatList((prevChatList) =>
        prevChatList.filter(chat => chat.id !== id)
      );
      showToast('删除成功', '', 'success')
      if (chatId === id) {
        router.replace('/home')
      }
    })
  }

  const [{ editTitle }] = useChatEdit();
  const commitTitle = (id: string, title: string) => {
    setIsCommit(true)
    return editTitle(id, title).then(() => {
      showToast('对话更新成功', '', 'success')
    }).finally(() => {
      setCurrentTitle('')
      setIsCommit(false)
    })
  }

  const updateChat = (chat: HistoryChat) => {
    let newChat = chat;
    if (chat.title !== currentTitle) {
      commitTitle(chat.id, currentTitle).then(() => {
        newChat.title = currentTitle;
      }).finally(() => {
        newChat.isEditing = false;
        setChatList(prevItems =>
          prevItems.map(item =>
            item.id === chat.id ? { ...item, newChat } : item
          )
        );
      })
    }
  }

  return (
    <ChatLayoutContext.Provider value={{
      newChat,
      refreshChatList,
      getCache,
      getRound,
      endRound,
      startRound
    }}>
      <div className={clsx(styles.chatLayout)}>
        <div className={clsx(styles.left, 'text-sm')}>
          <div className={styles.top}>
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
          </div>
          <ScrollBar className={styles.chatListWrapper}>
            {chatList.length ? (
              chatList.map((chat) => {
                const isActive = chat.id === chatId // 判断是否是当前选中项
                return (
                  <div
                    key={chat.id}
                    className={clsx(styles.chatItem, {
                      [styles.chatItem_active]: isActive // 添加选中样式
                    })}
                    onClick={() => {
                      if (chat.type === 'report') {
                        router.replace(`/workspaces/${workspaces.data[0].id}/documents`)
                      } else {
                        router.push(`/rag/${chat.id}`)
                      }
                    }}>
                    {
                      chat.isEditing ?
                        <div className={styles.itemTitleInputLayout}>
                          <input
                            type="text"
                            className={
                              styles.itemTitleInput
                            }
                            onChange={(e) => {
                              setCurrentTitle(e.target.value)
                            }}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault() // 防止默认的换行行为
                                updateChat(chat)
                              }
                            }}
                            value={currentTitle}
                            onBlur={() => {
                              let newChat = chat;
                              updateChat(chat)
                            }}
                            autoFocus
                          />
                          <div
                            className={isCommit ? styles.loadingIcon : styles.loadingIconHidden}
                          >
                            <Spin
                              color='#2F69FE'
                              wrapperClassName="pl-2" />
                          </div>
                        </div>
                        : <div className={
                          styles.itemTitle
                        }>
                          {chat.title}
                        </div>
                    }
                    <MoreBtn
                      items={[
                        { type: 'edit', label: '编辑标题' },
                        { type: 'del', label: '删除' },
                      ]}
                      onItemClick={(type) => {
                        if (type === 'del') {
                          deleteChatById(chat.id)
                        } else if (type === 'edit') {
                          setCurrentTitle(chat.title)
                          setChatList(prevItems =>
                            prevItems.map(item =>
                              item.id === chat.id ? { ...item, isEditing: true } : item
                            )
                          );
                        }
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
