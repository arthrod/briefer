import ChatDetail from '@/components/mf/ChatDetail'
import ChatInput from '@/components/mf/ChatInput'
import ChatLayout, { EventListener, useChatLayout } from '@/components/mf/ChatLayout'
import styles from './index.module.scss'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { ChatSessionData } from '@/hooks/mf/chat/useChatSession'
import ScrollBar from '@/components/ScrollBar'

function RagDetail() {
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const chatDetail = useRef<{
    addSendMsg: (msg: string) => Promise<ChatSessionData>
    addReceiveMsg: (msg: string) => string
    stopSendMsg: () => void
  }>(null)
  const router = useRouter()
  const { chatId } = router.query

  const send = (question: string) => {
    if (chatDetail.current) {
      chatDetail.current.addSendMsg(question)
    }
  }

  const stop = () => {
    chatDetail.current?.stopSendMsg()
  }

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
  const listChange = useCallback(() => {
    // 使用 setTimeout 确保在 DOM 更新后滚动
    setTimeout(scrollToBottom, 100)
  }, [])

  return (
    <div className={styles.rag_layout}>
      <ScrollBar className={styles.chat_detail} ref={scrollRef}>
        <ChatDetail
          ref={chatDetail}
          key={String(chatId)}
          loading={loading}
          openLoading={() => {
            setLoading(true)
          }}
          closeLoading={() => {
            setLoading(false)
          }}
          disableInput={() => {
            setDisabled(true)
          }}
          enableInput={() => {
            setDisabled(false)
          }}
          listChange={listChange}
          receiveMsgDone={() => {
            setLoading(false)
          }}></ChatDetail>
      </ScrollBar>

      <div className={styles.chat_input}>
        <ChatInput disabled={disabled} loading={loading} isUpload={false} send={send} stop={stop} />
      </div>
    </div>
  )
}

RagDetail.layout = ChatLayout

export default RagDetail
