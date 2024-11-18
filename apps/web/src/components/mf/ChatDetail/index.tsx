import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useState, useRef } from 'react'
import ScrollBar from '../../ScrollBar'
import styles from './index.module.scss'
import clsx from 'clsx'
import { Markdown } from '../markdown'
import { ChatType, MessageContent, RagDetailData, useChatDetail } from '@/hooks/mf/chat/useChatDetail'
import { useRouter } from 'next/router'
import { ChatSessionData, useChatSession } from '@/hooks/mf/chat/useChatSession'
import { EventListener, useChatLayout } from '../ChatLayout'
import { v4 as uuidv4 } from 'uuid';
import { showToast } from '../Toast'
import { useRagDetailLayout } from '@/pages/rag/[chatId]'
import { useSession } from '@/hooks/useAuth'
import { isBlockInDashboard } from '@briefer/editor'
import { parseSSEStream } from '@/hooks/mf/chat/useSSEMessage'
import RobotMessage from './RobotMessage'
const ChatDetail = forwardRef((props, ref) => {
  const [list, setList] = useState<MessageContent[]>([{ id: '', role: 'system', roundId: '', content: '我是您的AI小助手' }])
  const [blocks, setBlocks] = useState<{ type: string; content: string }[]>([]);
  const [{ createChatSession }] = useChatSession()
  const { startRound } = useChatLayout();
  const { disableInput, enableInput, openLoading, closeLoading } = useRagDetailLayout()
  useImperativeHandle(ref, () => ({
    addSendMsg: addSendMsg,
    addReceiveMsg: addReceiveMsg,
    updateMsg: updateMsg,
    stopSendMsg: stopSendMSg
  }))
  const session = useSession()
  const firstLetter = session.data?.loginName.charAt(0).toUpperCase(); // 获取用户名的第一个字母并转为大写

  let waiting = false;
  let listener: EventListener | null = null;
  const [{ getChatDetail }] = useChatDetail()
  const onRightClick = (e: any) => { }
  const router = useRouter()
  const chatId = router.query.chatId
  const stopSendMSg = (): void => {
    if (listener) {
      listener.close()
    }
  }

  const addSendMsg = (msg: string): void => {
    if (msg && !waiting) {
      openLoading()
      waiting = true;
      createChatSession(msg, String(chatId)).then((data: ChatSessionData) => {
        const msgId = uuidv4()
        const msgContent: MessageContent = { id: msgId, role: 'user', content: msg };
        setList((messageList) => [...messageList, msgContent])
        listener = startRound(String(chatId), data.id)
        const receiveMsg = addReceiveMsg('');
        const index = list.length + 1;
        console.log(index)
        const state = { currentType: '', currentContent: [] }
        listener.onopen = () => {
          console.log("SSE OPEN")
        }
        listener.onerror = (error) => {
          console.log("SSE ERROR", error)
          // updateMsg(receiveMsgId, '服务错误', true)
          // waiting = true
          // disableInput();
        }
        listener.onmessage = (event) => {
          // handleSSEMessage(event.data, state)
          setList((prevList) => {
            const lastIndex = prevList.length - 1; // 获取最后一条消息的索引
            const updatedList = [...prevList];
            if (lastIndex >= 0) {
              updatedList[lastIndex] = {
                ...updatedList[lastIndex],
                content: updatedList[lastIndex].content += event.data // 将新内容追加到最后一条消息
              };
            }
            return updatedList;
          });
        }
      }).catch((e) => {
        showToast('消息发送失败，请检查网络', '', 'error');
        waiting = false
      }).finally(() => {
        closeLoading()
      })
    }
  }
  const addReceiveMsg = (msg: string): MessageContent => {
    const msgId = uuidv4()
    const msgContent: MessageContent = { id: msgId, role: 'assistant', content: msg, roundId: '' };
    setList((messageList) => [...messageList, msgContent])
    return msgContent
  }

  const updateMsg = useCallback((id: string, msg: string, error: boolean): void => {
    setList(prevList =>
      prevList.map(item =>
        item.id === id
          ? { ...item, content: msg, isError: error }  // 如果找到匹配的 id，更新内容
          : item                       // 否则保持不变
      )
    )
  }, []);

  const handleRegenerate = useCallback((messageId: string) => {
    // 找到错误消息的前一条用户消息
    enableInput();
    const errorIndex = list.findIndex(msg => msg.id === messageId)
    if (errorIndex > 0) {
      const userMessage = list[errorIndex - 1]
      if (userMessage.role === 'user') {
        // 移除错误消息
        setList(prevList => {
          const newList = prevList.filter(msg => msg.id !== messageId)
          // 在列表更新的回调中重置 waiting 状态并发送消息
          waiting = false;
          addReceiveMsg('')
          // listener = startRound(String(chatId), msg.roundId)
          // const receiveMsgId = addReceiveMsg('');
          // listener.onopen = () => {

          // }
          // listener.onerror = (error) => {
          //   updateMsg(receiveMsgId, '服务错误', true)
          //   waiting = true
          //   disableInput();
          // }
          // listener.onmessage = (event) => {

          // }
          return newList
        })
      }
    }
  }, [list, addSendMsg])
  const getMessageElm = useCallback((message: MessageContent, index: number) => {
    if (message.role === 'system' || message.role === 'assistant') {
      return (
        <div className={clsx(styles.chatItem, styles.robot)} key={index}>
          <span className={styles.robot}>
            <img width={14} src="/icons/logo.svg" alt="" />
          </span>
          {message.isError ? ((<div className={styles.errorContent}>
            <div>发生错误。服务器发生错误，或者在处理您的请求时出现了其他问题</div>
            <div className={styles.buttonWrapper}>
              <div className={styles.errorButton}
                onClick={() => handleRegenerate(message.id)}
              >点击重新生成</div>
            </div>
          </div>)) :
            message.content ? (<div className={styles.content}>
              <RobotMessage key={index} content={message.content} />
            </div>) : (<div></div>)}
        </div>
      )
    } else {
      return (
        <div className={clsx(styles.chatItem, styles.user)} key={index}>
          <div className={styles.userAvatar}>
            {firstLetter}
          </div>
          <div className={styles.content}>
            <span key={index}>
              {message.content}
            </span>
          </div>
        </div>)
    }
  }, [handleRegenerate])
  const scrollRef = useRef<HTMLDivElement>(null)

  // 滚动到底部的函数
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current
      const targetScrollTop = scrollElement.scrollHeight
      const currentScrollTop = scrollElement.scrollTop
      const distance = targetScrollTop - currentScrollTop
      const duration = 300; // 设置滚动持续时间（毫秒）
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

  // 监听消息列表变化，自动滚动到底部
  useEffect(() => {
    scrollToBottom()
  }, [list])
  // 初始加载数据后滚动到底部
  useEffect(() => {
    if (chatId) {
      getChatDetail<RagDetailData>(String(chatId), 'rag').then((data) => {
        if (data) {
          data.messages.unshift({ id: '', role: 'system', content: '我是您的AI小助手' })
          setList(data.messages);
          // 使用 setTimeout 确保在 DOM 更新后滚动
          setTimeout(scrollToBottom, 100)
        }
      })
    }
  }, [chatId, router])

  return (
    <div className={styles.chatList} ref={scrollRef} key={String(chatId)}>
      {list.map((message, index) => (
        getMessageElm(message, index)
      ))}
    </div>
  )
})
export default ChatDetail
