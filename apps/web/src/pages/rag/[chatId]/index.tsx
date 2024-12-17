import ChatDetail from '@/components/mf/ChatDetail'
import ChatInput from '@/components/mf/ChatInput'
import ChatLayout, { useChatLayoutContext } from '@/components/mf/ChatLayout'
import styles from './index.module.scss'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { ChatStatus, useChatStatus } from '@/hooks/mf/chat/useChatStatus'
import { useStringQuery } from '@/hooks/useQueryArgs'
import { showToast } from '@/components/mf/Toast'

function RagDetailPage() {
  const [loading, setLoading] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const chatId = useStringQuery('chatId')

  const getChatStatus = useChatStatus()

  const { refreshRoundList, roundList, startRoundChat, stopChat, generating } = useChatLayoutContext()

  useEffect(() => {
    if (chatId) {
      refreshRoundList(chatId)
    } else {
      router.push('/home')
    }
  }, [chatId])

  const watchStatus = (isFirst: boolean) => {
    if (loading) {
      return
    }
    setLoading(true)
    return getChatStatus(chatId)
      .then((data: ChatStatus) => {
        if (data) {
          if (data.status === 'chatting') {
            window.setTimeout(() => {
              watchStatus(false)
            }, 3000)
          } else if (!isFirst) {
            refreshRoundList(chatId)
          } else {
            setLoading(false)
          }
        }
      })
      .catch(() => {
        setLoading(false)
      })
  }

  const addSendMsg = (msg: string) => {
    if (!msg || loading) {
      return
    }
    setLoading(true)
    startRoundChat(chatId, msg)
      .catch((e) => {
        showToast('消息发送失败，请检查网络', 'error')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const handleStop = () => {
    if (loading) {
      return
    }
    setLoading(true)
    stopChat().finally(() => {
      setLoading(false)
    })
  }

  return (
    <div className={styles.rag_layout}>
      <div ref={scrollRef} className={styles.detail_layout}>
        <ChatDetail
          type="rag"
          loading={generating}
          roundList={roundList}
          onRegenerate={() => {}}></ChatDetail>
      </div>

      <div className={styles.input_layout}>
        <ChatInput
          loading={generating}
          showUpload={false}
          onSend={async (question) => {
            await addSendMsg(question)
          }}
          onStop={handleStop}
        />
      </div>
    </div>
  )
}

RagDetailPage.layout = ChatLayout

export default RagDetailPage
