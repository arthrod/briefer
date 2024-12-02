import ChatDetail from '@/components/mf/ChatDetail'
import ChatInput from '@/components/mf/ChatInput'
import ChatLayout, {
  ChatRound,
  ChatSession,
  useChatLayoutContext,
} from '@/components/mf/ChatLayout'
import styles from './index.module.scss'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { MessageContent, RagDetailData, useChatDetail } from '@/hooks/mf/chat/useChatDetail'
import { ChatStatus, useChatStatus } from '@/hooks/mf/chat/useChatStatus'
import { useStringQuery } from '@/hooks/useQueryArgs'
import { showToast } from '@/components/mf/Toast'

function RagDetailPage() {
  const [loading, setLoading] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const chatId = useStringQuery('chatId')

  const getChatStatus = useChatStatus()

  const { loadDetail, setRoundList, roundList, startChat, stopChat, generating } =
    useChatLayoutContext()

  useEffect(() => {
    if (chatId) {
      setRoundList([])
      loadDetail(chatId).then(() => {
        watchStatus(true)
      })
    } else {
      router.push('/home')
    }
  }, [chatId])

  useEffect(() => {
    setLoading(!!generating)
  }, [generating])

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
            loadDetail(chatId)
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
    startChat(chatId, msg)
      .catch((e) => {
        showToast('消息发送失败，请检查网络', 'error')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  return (
    <div className={styles.rag_layout}>
      <div ref={scrollRef} className={styles.detail_layout}>
        <ChatDetail loading={generating} list={roundList} onRegenerate={() => {}}></ChatDetail>
      </div>

      <div className={styles.input_layout}>
        <ChatInput
          loading={generating}
          showUpload={false}
          onSend={async (question) => {
            await addSendMsg(question)
          }}
          onStop={() => {
            stopChat().finally(() => {
              setLoading(false)
            })
          }}
        />
      </div>
    </div>
  )
}

RagDetailPage.layout = ChatLayout

export default RagDetailPage
