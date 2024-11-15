import ChatDetail from '@/components/mf/ChatDetail'
import ChatInput from '@/components/mf/ChatInput'
import ChatLayout from '@/components/mf/ChatLayout'
import styles from './index.module.scss'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { RagDetailData, useChatDetail } from '@/hooks/mf/chat/useChatDetail'

function RagDetail() {
  const [{ getChatDetail }] = useChatDetail()
  const send = (question: string) => {
    if (chatDetail.current) {
      chatDetail.current.addSendMsg(question)
    }
    if (chatInput.current) {
      chatInput.current.clearQuestion()
    }
  }
  const router = useRouter()
  const chatId = router.query.chatId
  useEffect(() => {
    if (chatId) {
      getChatDetail<RagDetailData>(String(chatId), 'rag').then((data) => {
        if (data) {
          console.log(data.messages)
        }
      })
    }
  }, [chatId, router])
  const chatInput = useRef<{ clearQuestion: () => void }>(null)
  const chatDetail = useRef<{ addSendMsg: (msg: string) => void }>(null)

  return (
    <ChatLayout>
      <div className={styles.rag_layout}>
        <div className={styles.chat_detail}>
          <ChatDetail ref={chatDetail}></ChatDetail>
        </div>
        <div className={styles.chat_input}>
          <ChatInput isUpload={false} send={send} ref={chatInput} />
        </div>
      </div>
    </ChatLayout>
  )
}

export default RagDetail
