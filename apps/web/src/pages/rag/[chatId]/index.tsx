import ChatDetail from '@/components/mf/ChatDetail'
import ChatInput from '@/components/mf/ChatInput'
import ChatLayout from '@/components/mf/ChatLayout'
import styles from './index.module.scss'
import { useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { ChatSessionData } from '@/hooks/mf/chat/useChatSession'

function RagDetail() {
  const [loading, setLoading] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const chatDetail = useRef<{
    addSendMsg: (msg: string) => Promise<ChatSessionData>
    addReceiveMsg: (msg: string) => string
    stopSendMsg: () => void
  }>(null)
  const router = useRouter()
  const { chatId } = router.query

  const send = async (question: string) => {
    if (chatDetail.current) {
      chatDetail.current.addSendMsg(question)
    }
  }

  const stop = () => {
    chatDetail.current?.stopSendMsg()
  }

  return (
    <div className={styles.rag_layout}>
      <div ref={scrollRef} className={styles.detail_layout}>
        <ChatDetail
          ref={chatDetail}
          key={String(chatId)}
          openLoading={() => {
            setLoading(true)
          }}
          closeLoading={() => {
            setLoading(false)
          }}
          receiveMsgDone={() => {
            setLoading(false)
          }}></ChatDetail>
      </div>

      <div className={styles.input_layout}>
        <ChatInput loading={loading} showUpload={false} send={send} stop={stop} />
      </div>
    </div>
  )
}

RagDetail.layout = ChatLayout

export default RagDetail
