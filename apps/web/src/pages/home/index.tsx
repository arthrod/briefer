import React, { useCallback, useEffect, useRef, useState } from 'react'

import styles from './index.module.scss'
import ChatInput from '@/components/mf/ChatInput'

import RagIcon from '../../icons/rag.svg'
import ReportIcon from '../../icons/report.svg'
import ChatLayout, { useChatLayout } from '@/components/mf/ChatLayout'
import clsx from 'clsx'
import { useCreateChat } from '@/hooks/mf/chat/useCreateChat'
import { ChatType, HistoryChat } from '@/hooks/mf/chat/useChatList'
import { useRouter } from 'next/router'

function HomePage() {
  const [type, setType] = useState<ChatType>('rag')
  const [fileId, setFileId] = useState<string>('')
  const createChat = useCreateChat()
  const router = useRouter()
  const { newChat } = useChatLayout()
  const chatInput = useRef<{
    openLoading: () => void
    closeLoading: () => void
    refreshChatList: () => void
  }>(null)
  const [translateY, setTranslateY] = useState<number>(0) // State to control translation

  const setRagType = useCallback(() => {
    setType('rag')
  }, [])

  const setReportType = useCallback(() => {
    setType('report')
  }, [])

  const send = useCallback(
    (msg: string) => {
      chatInput.current?.openLoading()
      try {
        createChat(type, fileId).then((data) => {
          router.push(`/rag/${data.id}`, undefined, { shallow: true })
          newChat(data, msg)
        })
      } finally {
        chatInput.current?.closeLoading()
      }
    },
    [type]
  )

  const classNames = {
    rag: clsx(styles.item, { [styles.item_active]: type === 'rag' }),
    report: clsx(styles.report_margin, styles.item, { [styles.item_active]: type === 'report' }),
  }

  // 逐字动画逻辑
  const fullText = '我能帮你做点什么？'
  const [displayText, setDisplayText] = useState<string>('') // 当前显示的文字
  const [disableCursor, setDisableCursor] = useState<boolean>(false)

  useEffect(() => {
    let index = 0
    setDisplayText('')
    setDisableCursor(false)
    let intervalId = -1
    setTimeout(() => {
      intervalId = window.setInterval(() => {
        if (index < fullText.length) {
          setDisplayText((prev) => {
            const result = prev + fullText.charAt(index)
            index++
            return result
          }) // 添加当前索引字符
        } else {
          setDisableCursor(true)
          window.clearInterval(intervalId) // Clear the interval when done
        }
      }, 50)
    }, 300)
    return () => {
      window.clearInterval(intervalId) // 清理逻辑：组件卸载时停止动画
    }
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.title}>
        <div>{displayText}</div>
        <span className={clsx(styles.cursor, disableCursor ? styles.disableCursor : '')} />
      </div>
      <div className={styles.chat_input}>
        <ChatInput
          className={styles.input}
          isUpload={type === 'report'}
          send={send}
          ref={chatInput}
        />
      </div>
      <div className={styles.suggestions}>
        <div className={classNames.rag} onClick={setRagType}>
          <RagIcon />
          根据需求查找数据
        </div>
        <div className={classNames.report} onClick={setReportType}>
          <ReportIcon />
          撰写数据分析报告
        </div>
      </div>
    </div>
  )
}

HomePage.layout = ChatLayout

export default HomePage
