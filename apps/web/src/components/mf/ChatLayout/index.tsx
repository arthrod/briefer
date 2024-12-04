import { ChatList, HistoryChat, useChatList } from '@/hooks/mf/chat/useChatList'
import React, {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { clsx } from 'clsx'
import { useRouter } from 'next/router'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { NoData } from '@/components/mf/NoData'

import styles from './index.module.scss'
import ScrollBar from '@/components/ScrollBar'

import Logo from '@/icons/mind-flow.svg'
import { useSession } from '@/hooks/useAuth'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/Dialog'
import { useDeleteChat } from '@/hooks/mf/chat/useChatDelete'
import { showToast } from '../Toast'
import { useChatEdit } from '@/hooks/mf/chat/useChatEdit'
import Spin from '@/components/Spin'
import ArrowRight from '@/icons/arrow-right-line.svg'
import { useChatRoundCreate } from '@/hooks/mf/chat/useChatSessionCreate'
import { v4 as uuidv4 } from 'uuid'
import { ChatType, MessageContent, useChatDetail } from '@/hooks/mf/chat/useChatDetail'
import { useChatStop } from '@/hooks/mf/chat/useChatStop'
import { ChatStatus } from '@/hooks/mf/chat/useChatStatus'
import { useChatCreate } from '@/hooks/mf/chat/useCreateChat'

const defaultMsg: MessageContent = { id: '', role: 'system', content: '我是你的AI小助手' }
interface Item {
  type: string
  label: string
}

interface IMoreBtnProps {
  items: Item[]
  onItemClick?: (type: string) => void
}

const MoreBtn = ({ items, onItemClick }: IMoreBtnProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isDialogOpen, setDialogOpen] = useState(false)

  const handleDialogClose = () => {
    setDialogOpen(false)
  }
  return (
    <Popover className={styles.moreOpt}>
      {({ open, close }) => (
        <>
          <PopoverButton as="div" onClick={() => setIsOpen(!open)}>
            <img src="/icons/more.svg" width={16} />
          </PopoverButton>
          <PopoverPanel
            anchor="bottom"
            className={clsx('shadow-lg', styles.morePopoverLayout)}
            style={{ marginTop: '8px' }}>
            <div className={styles.moreBtnLayout}>
              {items.map((item, index) =>
                item.type === 'del' ? (
                  <AlertDialog key={index} open={isDialogOpen} onOpenChange={setDialogOpen}>
                    <AlertDialogTrigger
                      className="w-[100%]"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDialogOpen(true)
                      }}>
                      <div className={styles.moreBtn} key={index}>
                        {item.label}
                      </div>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>删除对话</AlertDialogTitle>
                        <AlertDialogDescription>确定删除该对话么？</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            close()
                            handleDialogClose()
                          }}>
                          取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            close()
                            handleDialogClose()
                            onItemClick && onItemClick(item.type)
                          }}>
                          确定
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <div
                    className={styles.moreBtn}
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      close()
                      onItemClick && onItemClick(item.type)
                    }}>
                    {item.label}
                  </div>
                )
              )}
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
export type ChatRound = {
  data: ChatStatus | null
  timeoutId: number
}

interface ChatLayoutContextType {
  chatList: HistoryChat[]
  setChatList: Dispatch<SetStateAction<HistoryChat[]>>
  addChatList: (chat: HistoryChat) => void
  refreshChatList: () => void
  roundList: MessageContent[]
  setRoundList: Dispatch<SetStateAction<MessageContent[]>>
  loadDetail: (chatId: string) => Promise<void>
  startRoundChat: (chatId: string, msg: string) => Promise<void>
  stopChat: () => Promise<void>
  createChat: (type: ChatType, _fileId?: string) => Promise<HistoryChat>
  getRound: (roundId: string) => ChatSession | undefined
  chat: (chatId: string, roundId: string) => ChatSession
  generating: boolean
}

export const ChatLayoutContext = createContext<ChatLayoutContextType | null>(null)

export function ChatLayoutProvider(props: { children: ReactNode }) {
  const [chatList, setChatList] = useState<HistoryChat[]>([])
  const [roundList, setRoundList] = useState<MessageContent[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])

  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  const curChatSession = useRef<ChatSession | null>(null)

  const getChatListApi = useChatList()
  const chatStopApi = useChatStop()
  const getChatDetailApi = useChatDetail()

  const chatCreateApi = useChatCreate()
  const chatRoundCreateApi = useChatRoundCreate()

  const addChatList = (chat: HistoryChat) => {
    setChatList((prevChatList) => [chat, ...prevChatList])
  }

  const refreshChatList = () => {
    getChatListApi().then((data: ChatList) => {
      setChatList(data.list)
    })
  }

  const createChat = (type: ChatType, _fileId?: string) => {
    setRoundList([defaultMsg])
    return chatCreateApi(type, _fileId).then((data) => {
      addChatList(data)
      return data
    })
  }

  const loadDetail = (chatId: string) => {
    if (loading) {
      return Promise.reject()
    }
    if (curChatSession.current?.chatId === chatId) {
      return Promise.resolve()
    }
    setLoading(true)
    return getChatDetailApi(chatId)
      .then((data) => {
        if (data) {
          const { messages } = data
          setRoundList([defaultMsg, ...(messages || [])])
        }
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const startRoundChat = async (
    chatId: string,
    question: string,
    receiveMsgDone?: (isError: boolean) => void
  ) => {
    const { id: roundId } = await chatRoundCreateApi(question, chatId)
    const msgId = uuidv4()
    const userMsg: MessageContent = {
      id: msgId,
      role: 'user',
      content: question,
    }
    const assistantMsg = createAssistantMsg('')
    assistantMsg.roundId = roundId
    setRoundList((preList) => {
      return [...preList, userMsg, assistantMsg]
    })

    sendChat(chatId, roundId, msgId, {
      receiveMsgDone: () => {
        receiveMsgDone && receiveMsgDone(true)
      },
    }).catch((e) => {
      receiveMsgDone && receiveMsgDone(true)
    })
  }

  const sendChat = async (
    chatId: string,
    roundId: string,
    msgId: string,
    { receiveMsgDone }: { receiveMsgDone: () => void }
  ) => {
    if (generating) {
      return
    }
    setGenerating(true)

    const _chatSession = chat(chatId, roundId)
    curChatSession.current = _chatSession

    _chatSession.listener.onopen = () => {}

    _chatSession.listener.onerror = () => {
      setGenerating(false)
      updateMsg(msgId, '服务错误', true)
      _receiveMsgDone()
    }

    _chatSession.listener.onmessage = (event) => {
      let { data } = event
      if (data === '[DONE]') {
        setGenerating(false)
        receiveMsgDone()
        _receiveMsgDone()
        return null
      }
      setRoundList((prevList) => {
        const lastIndex = prevList.length - 1 // 获取最后一条消息的索引
        const updatedList = [...prevList]
        if (lastIndex >= 0 && updatedList[lastIndex]) {
          const lastItem = updatedList[lastIndex]
          lastItem.content += data
        }
        return updatedList
      })
    }

    _chatSession.listener.close = () => {
      // updateMsgStatus(msgId)
    }
  }

  const updateMsg = (id: string, msg: string, error: boolean) => {
    setRoundList((prevList) =>
      prevList.map(
        (item) =>
          item.id === id
            ? { ...item, content: msg, isError: error } // 如果找到匹配的 id，更新内容
            : item // 否则保持不变
      )
    )
  }

  const handleRegenerate = (message: MessageContent) => {
    updateMsg(message.id, '', false)
    if (message.roundId) {
      // waitingReceive(message.id, message.roundId)
    }
  }

  const updateMsgStatus = useCallback((id: string): void => {
    setRoundList((prevList) =>
      prevList.map(
        (item) =>
          item.id === id
            ? { ...item, status: status } // 如果找到匹配的 id，更新内容
            : item // 否则保持不变
      )
    )
  }, [])

  const _receiveMsgDone = () => {
    if (curChatSession && curChatSession.current) {
      curChatSession.current?.listener.close()
      curChatSession.current?.eventSource.close()
      curChatSession.current = null
    }
  }

  const createAssistantMsg = (msg: string): MessageContent => {
    return {
      id: uuidv4(),
      role: 'assistant',
      content: msg,
      roundId: '',
    }
  }

  const getRound = useCallback((roundId: string) => {
    for (let i = 0; i < chatSessions.length; i++) {
      if (chatSessions[i].roundId === roundId) {
        return chatSessions[i]
      }
    }
  }, [])

  const chat = (chatId: string, roundId: string) => {
    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/mf/chat/completions?chatId=${chatId}&roundId=${roundId}`,
      {
        withCredentials: true, // 如果需要发送 cookies
      }
    )
    const listener: EventListener = {
      close: () => {
        eventSource.close()
      },
    }
    const chatSession = {
      chatId: chatId,
      roundId: roundId,
      content: '',
      listener: listener,
      eventSource: eventSource,
    }

    setChatSessions((sessions) => [...sessions, chatSession])

    eventSource.onopen = () => {
      if (listener.onopen) {
        listener.onopen()
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

    return chatSession
  }

  const stopChat = useCallback(async (): Promise<void> => {
    if (curChatSession.current) {
      const { roundId, eventSource, listener } = curChatSession.current
      return chatStopApi(roundId)
        .then(() => {
          eventSource.close()
          listener.close()
        })
        .catch(() => {
          showToast('停止失败，请重试', 'error')
        })
    }
  }, [roundList])

  return (
    <ChatLayoutContext.Provider
      value={{
        chatList,
        loadDetail,
        setChatList,
        addChatList,
        refreshChatList,
        roundList,
        setRoundList,
        createChat,
        startRoundChat,
        stopChat,
        getRound,
        chat,
        generating,
      }}>
      {props.children}
    </ChatLayoutContext.Provider>
  )
}

export const useChatLayoutContext = () => {
  const context = useContext(ChatLayoutContext)
  if (!context) {
    throw new Error('useChatLayout must be used within ChatLayoutProvider')
  }
  return context
}

export default function ChatLayout({ children }: Props) {
  const [updateTitleEvent, setUpdateTitleEvent] = useState<EventSource | null>(null)
  const [chatId, setChatId] = useState('')
  const [routeTitle, setRouteTitle] = useState('')
  const [currentTitle, setCurrentTitle] = useState('')
  const [isCommit, setIsCommit] = useState(false)

  const eventTimeoutId = useRef(-1)
  const lastedTimeoutId = useRef(-1)
  const lastedEvent = useRef<EventSource | null>(updateTitleEvent)
  const [workspaces] = useWorkspaces()
  const session = useSession()
  const router = useRouter()
  const [{ deleteChat }] = useDeleteChat()
  const [{ editTitle }] = useChatEdit()
  const { chatList, setChatList, refreshChatList } = useChatLayoutContext()

  const firstLetter = session.data?.loginName.charAt(0).toUpperCase() // 获取用户名的第一个字母并转为大写

  useEffect(() => {
    setChatId(String(router.query.chatId))
    refreshChatList()
    titleUpdate()
    return () => {
      if (lastedEvent.current) {
        lastedEvent.current.close()
      }
    }
  }, [])

  useEffect(() => {
    setChatId(String(router.query.chatId))
    setRouteTitle(() => {
      const { pathname } = router
      if (pathname === `/user/profile`) {
        return '个人中心'
      }
      return ''
    })
  }, [router])

  useEffect(() => {
    lastedTimeoutId.current = eventTimeoutId.current
  }, [eventTimeoutId])

  useEffect(() => {
    lastedEvent.current = updateTitleEvent
  }, [updateTitleEvent])

  const titleUpdate = useCallback(() => {
    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/mf/chat/title/update`,
      {
        withCredentials: true, // 如果需要发送 cookies
      }
    )
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        setChatList((prevList) => {
          const lastIndex = prevList.findIndex((item) => item.id === data.chatId) // 获取最后一条消息的索引
          const updatedList = [...prevList]
          if (lastIndex >= 0) {
            updatedList[lastIndex] = {
              ...updatedList[lastIndex],
              title: (updatedList[lastIndex].title = data.title), // 将新内容追加到最后一条消息
            }
          }
          return updatedList
        })
      } catch (e) {}
    }
    eventSource.onerror = (error) => {
      eventSource.close()
      eventTimeoutId.current = window.setTimeout(() => {
        titleUpdate()
      }, 5000)
    }
    setUpdateTitleEvent(eventSource)
  }, [chatList])

  const deleteChatById = (id: string) => {
    deleteChat(id).then(() => {
      setChatList((prevChatList) => prevChatList.filter((chat) => chat.id !== id))
      showToast('删除成功', 'success')
      if (chatId === id) {
        router.replace('/home')
      }
    })
  }

  const commitTitle = (id: string, title: string) => {
    setIsCommit(true)
    return editTitle(id, title)
      .then(() => {
        showToast('对话更新成功', 'success')
      })
      .finally(() => {
        setCurrentTitle('')
        setIsCommit(false)
      })
  }

  const updateChat = (chat: HistoryChat) => {
    if (chat.title !== currentTitle) {
      commitTitle(chat.id, currentTitle)
        .then(() => {
          chat.title = currentTitle
        })
        .finally(() => {
          chat.isEditing = false
          setChatList((prevItems) =>
            prevItems.map((item) => (item.id === chat.id ? { ...item, newChat: chat } : item))
          )
        })
    } else {
      chat.isEditing = false
      setChatList((prevItems) =>
        prevItems.map((item) => (item.id === chat.id ? { ...item, newChat: chat } : item))
      )
    }
  }

  return (
    <div className={clsx(styles.chatLayout)}>
      <div className={clsx(styles.left, 'text-sm')}>
        <div className={styles.top}>
          <div
            className={clsx('flex w-full flex-col', styles.logo_icon)}
            onClick={() => {
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
              return (
                <div
                  key={chat.id}
                  className={clsx(
                    styles.chatItem,
                    chat.id === chatId ? styles.active : '' // 添加选中样式
                  )}
                  onClick={() => {
                    if (chat.id === chatId) {
                      return
                    }
                    if (chat.type === 'report') {
                      router.push(
                        `/workspaces/${workspaces.data[0].id}/documents/${chat.documentId}/notebook/edit?chatId=${chat.id}`
                      )
                    } else {
                      router.push(`/rag/${chat.id}`)
                    }
                  }}>
                  {chat.isEditing ? (
                    <div className={styles.inputLayout}>
                      <input
                        type="text"
                        className={styles.itemTitleInput}
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
                          updateChat(chat)
                        }}
                        autoFocus
                      />
                      <div className={isCommit ? styles.loadingIcon : styles.loadingIconHidden}>
                        <Spin color="#2F69FE" wrapperClassName="pl-2" />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.itemTitle}>{chat.title}</div>
                  )}
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
                        setChatList((prevItems) =>
                          prevItems.map((item) =>
                            item.id === chat.id ? { ...item, isEditing: true } : item
                          )
                        )
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
        <div className={styles.mainTop}>
          <div className={styles.title}>
            {routeTitle ? (
              <>
                <span
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    router.back()
                  }}>
                  <ArrowRight />
                </span>
                <span>{routeTitle}</span>
              </>
            ) : null}
          </div>
          <div
            className={styles.userAvatar}
            onClick={() => {
              router.push('/user/profile')
            }}>
            {firstLetter}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
