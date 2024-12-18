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

import styles from './index.module.scss'

import { useSession } from '@/hooks/useAuth'

import { showToast } from '../Toast'

import ArrowRight from '@/icons/arrow-right-line.svg'
import { useChatRoundCreate } from '@/hooks/mf/chat/useChatSessionCreate'
import { v4 as uuidv4 } from 'uuid'
import { FileInfo, MessageContent, useChatDetail } from '@/hooks/mf/chat/useChatDetail'
import { useChatStop } from '@/hooks/mf/chat/useChatStop'
import { ChatStatus } from '@/hooks/mf/chat/useChatStatus'
import { useChatCreate } from '@/hooks/mf/chat/useCreateChat'
import ChatListBox from '../ChatList'
import { StepJsonType } from '../ChatDetail/ReportStep'
import { ChatType } from '../../../../chat'
const defaultMsg: MessageContent = { id: '', role: 'system', content: '我是你的AI小助手' }
const empty: StepJsonType = { type: 'step', content: { jobs: [] } }

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
  fileInfo: FileInfo | null
  chatList: HistoryChat[]
  setChatList: Dispatch<SetStateAction<HistoryChat[]>>
  addChatList: (chat: HistoryChat) => void
  refreshChatList: () => void
  roundList: MessageContent[]
  setRoundList: Dispatch<SetStateAction<MessageContent[]>>
  refreshRoundList: (chatId: string) => Promise<void>
  startRoundChat: (
    chatId: string,
    msg: string,
    doneCallback?: (isError: boolean) => void
  ) => Promise<void>
  stopChat: () => Promise<void>
  createChat: (type: ChatType, _fileId?: string) => Promise<HistoryChat>
  getRound: (roundId: string) => ChatSession | undefined
  chat: (chatId: string, roundId: string) => ChatSession
  generating: boolean
}

export const ChatContext = createContext<ChatLayoutContextType | null>(null)
const sseLoadingMap = new Map<string, boolean>() // 用于AI生成
export function ChatProvider(props: { children: ReactNode }) {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [chatList, setChatList] = useState<HistoryChat[]>([])
  const [roundList, setRoundList] = useState<MessageContent[]>([])
  const chatSessions = useRef<ChatSession[]>([])

  const [loading, setLoading] = useState(false) // 用于接口发送

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

  const refreshRoundList = (chatId: string) => {
    if (loading) {
      return Promise.reject()
    }
    // if (curChatSession.current?.chatId === chatId) {
    //   return Promise.resolve()
    // }
    setLoading(true)
    return getChatDetailApi(chatId)
      .then((data) => {
        if (data) {
          const { file, messages = [] } = data
          const lastItem = messages[messages.length - 1]
          if (lastItem.role === 'assistant') {
            setRoundList([defaultMsg, ...(messages || [])])
          }
          if (file) {
            setFileInfo(file)
          }
        }
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const startRoundChat = async (
    chatId: string,
    question: string,
    doneCallback?: (isError: boolean) => void
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

    sendChat(chatId, roundId, msgId, doneCallback)
  }

  const sendChat = async (
    chatId: string,
    roundId: string,
    msgId: string,
    doneCallback?: (isError: boolean) => void
  ) => {
    if (sseLoadingMap.get(chatId)) {
      return
    }
    sseLoadingMap.set(chatId, true)

    const _chatSession = chat(chatId, roundId)
    curChatSession.current = _chatSession

    _chatSession.listener.onopen = () => {}

    _chatSession.listener.onerror = () => {
      updateMsg(msgId, '服务错误', true)
      sessionReset(chatId)
    }

    _chatSession.listener.onmessage = (event) => {
      let { data } = event
      if (!data) {
        return
      }
      if (data === '[NEW_STEP]') {
        const assistantMsg = createAssistantMsg('', roundId)
        setRoundList((preList) => {
          return [...preList, assistantMsg]
        })
        return
      }
      if (data === '[DONE]') {
        chatSessions.current = chatSessions.current.filter((item) => item.roundId !== roundId)
        doneCallback?.(false)
        sessionReset(chatId)
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

    _chatSession.listener.close = () => {}
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

  const sessionReset = (chatId: string) => {
    if (curChatSession && curChatSession.current) {
      curChatSession.current?.listener.close()
      curChatSession.current?.eventSource.close()
      curChatSession.current = null
      sseLoadingMap.delete(chatId)
    }
  }

  const createAssistantMsg = (msg: string, roundId?: string): MessageContent => {
    return {
      id: roundId || uuidv4(),
      role: 'assistant',
      content: msg,
      roundId: '',
    }
  }

  const getRound = useCallback((roundId: string) => {
    for (let i = 0; i < chatSessions.current.length; i++) {
      if (chatSessions.current[i].roundId === roundId) {
        return chatSessions.current[i]
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

    chatSessions.current.push(chatSession)

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
      const { chatId, roundId } = curChatSession.current
      return chatStopApi(roundId)
        .then(() => {
          sessionReset(chatId)
        })
        .catch(() => {
          showToast('停止失败，请重试', 'error')
        })
    }
  }, [roundList])

  return (
    <ChatContext.Provider
      value={{
        fileInfo,
        chatList,
        setChatList,
        addChatList,
        refreshChatList,
        roundList,
        setRoundList,
        refreshRoundList,
        createChat,
        startRoundChat,
        stopChat,
        getRound,
        chat,
        generating: !!curChatSession.current
          ? !!sseLoadingMap.get(curChatSession.current?.chatId)
          : false,
      }}>
      {props.children}
    </ChatContext.Provider>
  )
}

export const useChatLayoutContext = () => {
  const context = useContext(ChatContext)
  useEffect(() => {
    context?.refreshChatList()
  }, [])
  if (!context) {
    throw new Error('useChatLayout must be used within ChatLayoutProvider')
  }
  return context
}

export default function ChatLayout({ children }: Props) {
  const [routeTitle, setRouteTitle] = useState('')

  const [workspaces] = useWorkspaces()
  const session = useSession()
  const router = useRouter()

  const firstLetter = session.data?.loginName.charAt(0).toUpperCase() // 获取用户名的第一个字母并转为大写
  const chatId = router.query.chatId

  useEffect(() => {
    setRouteTitle(() => {
      const { pathname } = router
      if (pathname === `/user/profile`) {
        return '个人中心'
      }
      return ''
    })
  }, [router])

  if (!workspaces || workspaces.data.length === 0) {
    return
  }

  return (
    <div className={clsx(styles.chatLayout)}>
      <div className={clsx(styles.left, 'text-sm')}>
        <ChatListBox chatId={chatId?.toString() || ''} workspaceId={workspaces.data[0].id} />
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
