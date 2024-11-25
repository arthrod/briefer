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
import {
  MessageContent,
  MessageStatus,
  RagDetailData,
  useChatDetail,
} from '@/hooks/mf/chat/useChatDetail'
import { useRouter } from 'next/router'
import { ChatSessionData, useChatSession } from '@/hooks/mf/chat/useChatSession'
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
  loading: boolean
  openLoading: () => void
  closeLoading: () => void
  receiveMsgDone?: () => void
}

type ChatRound = {
  data: ChatStatus | null
  timeoutId: number
}

const ChatDetail = forwardRef(
  ({ openLoading, closeLoading, receiveMsgDone }: ChatDetailProps, ref) => {
    const [list, setList] = useState<MessageContent[]>([])
    const [chatSession, setChatSession] = useState<ChatSession | null>(null)
    const [chatRound, setChatRound] = useState<ChatRound>({ data: null, timeoutId: -1 })

    const [waiting, setWaiting] = useState<boolean>(false)

    const latestChatRound = useRef(chatRound)
    const [{ createChatSession }] = useChatSession()

    const { startRound, getCache } = useChatLayoutContext()

    const [{ getChatStatus }] = useChatStatus()
    const [{ stopChat }] = useChatStop()
    const session = useSession()
    const getChatDetail = useChatDetail()

    const scrollRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => ({
      addSendMsg: addSendMsg,
      addReceiveMsg: addReceiveMsg,
      updateMsg: updateMsg,
      stopSendMsg: stopSendMSg,
    }))

    const firstLetter = session.data?.loginName.charAt(0).toUpperCase() // 获取用户名的第一个字母并转为大写

    const router = useRouter()
    const chatId = router.query.chatId

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
      if (chatSession) {
        stopChat(chatSession.roundId)
          .then(() => {
            chatSession.eventSource.close()
            chatSession.listener.close()
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

    const addSendMsg = useCallback(
      (msg: string): void => {
        if (msg && !waiting) {
          openLoading()
          setWaiting(true)
          createChatSession(msg, String(chatId))
            .then((data: ChatSessionData) => {
              const msgId = uuidv4()
              const msgContent: MessageContent = {
                id: msgId,
                role: 'user',
                content: msg,
                status: 'success',
              }
              setList((messageList) => [...messageList, msgContent])
              const receiveMsg = addReceiveMsg('', 'chatting')
              receiveMsg.roundId = data.id
              waitingReceive(receiveMsg.id, data.id)
            })
            .catch((e) => {
              showToast('消息发送失败，请检查网络', 'error')
              closeLoading()
              setWaiting(false)
            })
        }
      },
      [waiting, list]
    )

    const waitingReceive = (msgId: string, roundId: string) => {
      const chatSession = startRound(String(chatId), roundId)
      setChatSession(chatSession)
      chatSession.listener.onopen = () => {
        openLoading()
      }
      chatSession.listener.onerror = (error) => {
        updateMsg(msgId, '服务错误', true)
        setWaiting(true)
        closeLoading()
      }

      chatSession.listener.onmessage = (event) => {
        let { data } = event
        if (data === '[DONE]') {
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

      chatSession.listener.close = () => {
        setWaiting(false)
        updateMsgStatus(msgId, 'success')
        closeLoading()
      }
    }

    const addReceiveMsg = (msg: string, status: MessageStatus): MessageContent => {
      const msgContent: MessageContent = {
        id: uuidv4(),
        role: 'assistant',
        content: msg,
        roundId: '',
        status: status,
      }
      setList((messageList) => [...messageList, msgContent])
      return msgContent
    }

    const updateMsgStatus = useCallback((id: string, status: MessageStatus): void => {
      setList((prevList) =>
        prevList.map(
          (item) =>
            item.id === id
              ? { ...item, status: status } // 如果找到匹配的 id，更新内容
              : item // 否则保持不变
        )
      )
    }, [])

    const updateMsg = useCallback((id: string, msg: string, error: boolean): void => {
      setList((prevList) =>
        prevList.map(
          (item) =>
            item.id === id
              ? { ...item, content: msg, isError: error } // 如果找到匹配的 id，更新内容
              : item // 否则保持不变
        )
      )
    }, [])

    const handleRegenerate = (message: MessageContent) => {
      updateMsg(message.id, '', false)
      if (message.roundId) {
        waitingReceive(message.id, message.roundId)
      }
    }

    const _receiveMsgDone = () => {
      chatSession?.eventSource.close()
      chatSession?.listener.close()
      setChatSession(null)
      if (receiveMsgDone) {
        receiveMsgDone()
      }
    }

    const getSuccessElm = (message: MessageContent, index: number) => {
      return message.isError ? (
        <div className={styles.errorContent}>
          <div>发生错误。服务器发生错误，或者在处理您的请求时出现了其他问题</div>
          <div className={styles.buttonWrapper}>
            <div className={styles.errorButton} onClick={() => handleRegenerate(message)}>
              点击重新生成
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.content} key={index}>
          <Markdown>{message.content}</Markdown>
          {/* <RobotMessage content={message.content} receiveMsgDone={_receiveMsgDone} /> */}
          {message.status === 'chatting' ? <Pointer /> : null}
        </div>
      )
    }

    const getMessageElm = useCallback(
      (message: MessageContent, index: number) => {
        if (message.role === 'system' || message.role === 'assistant') {
          return (
            <div className={clsx(styles.chatItem, styles.robot)} key={index}>
              <span className={styles.robot}>
                <img width={14} src="/icons/logo.svg" alt="" />
              </span>
              {getSuccessElm(message, index)}
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

    useEffect(() => {
      setTimeout(scrollToBottom, 100)
    }, [list])

    const loadDetail = () => {
      return getChatDetail<RagDetailData>(String(chatId), 'rag').then((data) => {
        if (data) {
          data.messages.unshift({ id: '', role: 'system', content: defaultMsg, status: 'success' })
          setList(data.messages)
          const msg = getCache()
          console.log('当前是否有缓存的用户问题内存，如果有就直接发送：' + msg)
          if (msg) {
            addSendMsg(msg)
          }
        }
      })
    }
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
      <ScrollBar ref={scrollRef} className={styles.chatList} key={String(chatId)}>
        {list.map((message, index) => getMessageElm(message, index))}
      </ScrollBar>
    )
  }
)

export default ChatDetail
