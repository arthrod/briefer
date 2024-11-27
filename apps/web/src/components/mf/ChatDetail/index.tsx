import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useState,
  useRef,
} from 'react'
import styles from './index.module.scss'
import clsx from 'clsx'
import { MessageContent, RagDetailData, useChatDetail } from '@/hooks/mf/chat/useChatDetail'
import { useRouter } from 'next/router'
import { ChatSessionCreateData, useChatSessionCreate } from '@/hooks/mf/chat/useChatSessionCreate'
import { ChatSession, useChatLayoutContext } from '../ChatLayout'
import { v4 as uuidv4 } from 'uuid'
import { showToast } from '../Toast'
import { useSession } from '@/hooks/useAuth'
import { ChatStatus, useChatStatus } from '@/hooks/mf/chat/useChatStatus'
import { useChatStop } from '@/hooks/mf/chat/useChatStop'
import ScrollBar from '@/components/ScrollBar'
import Pointer from '../Pointer'
import Markdown from '../markdown'
const defaultMsg = '我是你的AI小助手'
export interface ChatDetailProps {
  openLoading: () => void
  closeLoading: () => void
  receiveMsgDone?: () => void
}

export interface ChatDetailRef {
  addSendMsg: (msg: string) => Promise<ChatSessionCreateData | void>
  addAssistantMsg: (msg: string) => MessageContent
  updateMsg: (id: string, msg: string, error: boolean) => void
  stopSendMsg: () => void
}

type ChatRound = {
  data: ChatStatus | null
  timeoutId: number
}

const ChatDetail = forwardRef<ChatDetailRef, ChatDetailProps>(
  ({ openLoading, closeLoading, receiveMsgDone }, ref) => {
    const [list, setList] = useState<MessageContent[]>([])
    const [chatRound, setChatRound] = useState<ChatRound>({ data: null, timeoutId: -1 })

    const [waiting, setWaiting] = useState(false)

    const chatSession = useRef<ChatSession | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const latestChatRound = useRef(chatRound)

    const session = useSession()
    const { startRound, getCache } = useChatLayoutContext()

    const getChatDetail = useChatDetail()
    const createChatSession = useChatSessionCreate()
    const getChatStatus = useChatStatus()
    const stopChat = useChatStop()

    const firstLetter = session.data?.loginName.charAt(0).toUpperCase() // 获取用户名的第一个字母并转为大写

    const router = useRouter()
    const chatId = router.query.chatId

    useImperativeHandle(ref, () => ({
      addSendMsg: addSendMsg,
      addAssistantMsg: addAssistantMsg,
      updateMsg: updateMsg,
      stopSendMsg: stopSendMSg,
    }))

    useEffect(() => {
      setTimeout(scrollToBottom, 100)
    }, [list])

    useEffect(() => {
      if (chatId) {
        loadDetail()
          .then(() => {
            watchStatus(true)
          })
          .catch((e) => {
            if (e.code === 403) {
              router.replace('/home')
            }
          })
      }
    }, [chatId, router])

    // 初始加载数据后滚动到底部
    useEffect(() => {
      return () => {
        closeLoading()
        window.clearTimeout(latestChatRound.current.timeoutId)
      }
    }, [])

    useEffect(() => {
      latestChatRound.current = chatRound
    }, [chatRound])

    const scrollToBottom = useCallback(() => {
      if (scrollRef.current) {
        const scrollElement = scrollRef.current
        const targetScrollTop = scrollElement.scrollHeight
        const currentScrollTop = scrollElement.scrollTop
        const distance = targetScrollTop - currentScrollTop
        const duration = 300 // 设置滚动持续时间（毫秒）
        const startTime = performance.now()

        const animateScroll = (currentTime: number) => {
          const elapsed = currentTime - startTime
          const progress = Math.min(elapsed / duration, 1) // 计算进度
          scrollElement.scrollTop = currentScrollTop + distance * easeInOutQuad(progress)

          if (elapsed < duration) {
            requestAnimationFrame(animateScroll)
          }
        }

        // 缓动函数
        const easeInOutQuad = (t: number) => {
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        }

        requestAnimationFrame(animateScroll)
      }
    }, [])

    const stopSendMSg = useCallback((): void => {
      if (chatSession.current) {
        const { roundId, eventSource, listener } = chatSession.current
        stopChat(roundId)
          .then(() => {
            eventSource.close()
            listener.close()
          })
          .catch(() => {
            showToast('停止失败，请重试', 'error')
          })
      } else if (chatRound && chatRound.data && chatRound.timeoutId != -1) {
        if (chatRound.data.roundId) {
          stopChat(chatRound.data.roundId)
            .then(() => {
              window.clearTimeout(chatRound.timeoutId)
              closeLoading()
              loadDetail().then(() => {
                watchStatus(true)
              })
            })
            .catch(() => {
              showToast('停止失败，请重试', 'error')
            })
        } else {
          showToast('停止失败，请重试', 'error')
        }
      }
    }, [list, chatRound])

    const addSendMsg = async (msg: string) => {
      if (msg && !waiting) {
        openLoading()
        setWaiting(true)
        return await createChatSession(msg, String(chatId))
          .then((data) => {
            const msgId = uuidv4()
            const msgContent: MessageContent = {
              id: msgId,
              role: 'user',
              content: msg,
            }
            setList((messageList) => [...messageList, msgContent])
            const receiveMsg = addAssistantMsg('')
            receiveMsg.roundId = data.id
            waitingReceive(receiveMsg.id, data.id)
            return data
          })
          .catch((e) => {
            showToast('消息发送失败，请检查网络', 'error')
            closeLoading()
            setWaiting(false)
          })
      } else {
        return Promise.reject('')
      }
    }

    const waitingReceive = (msgId: string, roundId: string) => {
      const _chatSession = startRound(String(chatId), roundId)
      chatSession.current = _chatSession

      _chatSession.listener.onopen = () => {
        openLoading()
      }
      _chatSession.listener.onerror = (error) => {
        updateMsg(msgId, '服务错误', true)
        setWaiting(false)
        closeLoading()
      }

      _chatSession.listener.onmessage = (event) => {
        let { data } = event
        if (data === '[DONE]') {
          _receiveMsgDone()
          return null
        }
        setList((prevList) => {
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
        setWaiting(false)
        updateMsgStatus(msgId)
        closeLoading()
      }
    }

    const addAssistantMsg = (msg: string) => {
      const msgContent: MessageContent = {
        id: uuidv4(),
        role: 'assistant',
        content: msg,
        roundId: '',
      }
      setList((messageList) => [...messageList, msgContent])
      return msgContent
    }

    const updateMsgStatus = useCallback((id: string): void => {
      setList((prevList) =>
        prevList.map(
          (item) =>
            item.id === id
              ? { ...item, status: status } // 如果找到匹配的 id，更新内容
              : item // 否则保持不变
        )
      )
    }, [])

    const updateMsg = (id: string, msg: string, error: boolean) => {
      setList((prevList) =>
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
        waitingReceive(message.id, message.roundId)
      }
    }

    const _receiveMsgDone = () => {
      chatSession.current?.eventSource.close()
      chatSession.current?.listener.close()
      chatSession.current = null
      setWaiting(false)
      if (receiveMsgDone) {
        receiveMsgDone()
      }
    }

    const getMessageElm = useCallback(
      (message: MessageContent, index: number) => {
        if (message.role === 'system' || message.role === 'assistant') {
          return (
            <div className={clsx(styles.chatItem, styles.robot)} key={index}>
              <span className={styles.robot}>
                <img width={14} src="/icons/logo.svg" alt="" />
              </span>
              {message.isError ? (
                <div className={styles.errorContent}>
                  <div>发生错误。服务器发生错误，或者在处理您的请求时出现了其他问题</div>
                  <div className={styles.buttonWrapper}>
                    <div className={styles.errorButton} onClick={() => handleRegenerate(message)}>
                      点击重新生成
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.content}>
                  <Markdown>{message.content}</Markdown>
                  {waiting && index === list.length - 1 ? <Pointer /> : null}
                </div>
              )}
            </div>
          )
        } else {
          return (
            <div className={clsx(styles.chatItem, styles.user)} key={index}>
              <div className={styles.userAvatar}>{firstLetter}</div>
              <div className={styles.content}>
                <span key={index}>{message.content}</span>
              </div>
            </div>
          )
        }
      },
      [list]
    )

    const loadDetail = () => {
      return getChatDetail<RagDetailData>(String(chatId), 'rag').then((data) => {
        if (data) {
          data.messages.unshift({ id: '', role: 'system', content: defaultMsg })
          setList(data.messages)
          const msg = getCache()
          console.log('当前是否有缓存的用户问题内存，如果有就直接发送：' + msg)
          if (msg) {
            addSendMsg(msg)
          }
        }
      })
    }

    const stopWatchStatus = () => {
      closeLoading()
      window.clearTimeout(latestChatRound.current.timeoutId)
    }

    const watchStatus = useCallback(
      (isFirst: boolean) => {
        getChatStatus(String(chatId)).then((data: ChatStatus) => {
          if (data) {
            if (data.status === 'chatting') {
              stopWatchStatus()
              openLoading()
              const timeoutId = window.setTimeout(() => {
                watchStatus(false)
              }, 3000)
              setChatRound({
                data: data,
                timeoutId: timeoutId,
              })
            } else if (!isFirst) {
              loadDetail()
              stopWatchStatus()
            }
          } else {
            stopWatchStatus()
          }
        })
      },
      [chatRound]
    )
    return (
      <ScrollBar ref={scrollRef} className={styles.chatDetailLayout} key={String(chatId)}>
        {list.map((message, index) => getMessageElm(message, index))}
      </ScrollBar>
    )
  }
)

export default ChatDetail
