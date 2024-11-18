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
  const [{ createChat }] = useCreateChat()
  const router = useRouter()
  const { newChat, refreshChatList, getScope } = useChatLayout()
  const chatInput = useRef<{
    openLoading: () => void
    closeLoading: () => void
    refreshChatList: () => void
  }>(null)
  const setRagType = useCallback(() => {
    setType('rag')
  }, [])
  const setReportType = useCallback(() => {
    setType('report')
  }, [])
  const send = useCallback((msg: string) => {
    chatInput.current?.openLoading()
    try {
      createChat(type, fileId).then((data) => {
        router.push(`/rag/${data.id}`, undefined, { shallow: true })
        newChat(data, msg);
      })
    } finally {
      chatInput.current?.closeLoading()
    }
  }, [])
  const classNames = {
    rag: clsx(styles.item, { [styles.item_active]: type === 'rag' }),
    report: clsx(styles.report_margin, styles.item, { [styles.item_active]: type === 'report' }),
  }

  return (
    <div className={styles.container}>
      <div className={styles.title}>我能帮你做点儿什么？</div>
      <div className={styles.chat_input}>
        <ChatInput
          className={styles.input}
          isUpload={type == 'report'}
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
