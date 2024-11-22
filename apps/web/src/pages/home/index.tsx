import React, { useCallback, useEffect, useRef, useState } from 'react'

import styles from './index.module.scss'
import ChatInput from '@/components/mf/ChatInput'

import RagIcon from '../../icons/rag.svg'
import ReportIcon from '../../icons/report.svg'
import ChatLayout, { useChatLayout } from '@/components/mf/ChatLayout'
import clsx from 'clsx'
import { useCreateChat } from '@/hooks/mf/chat/useCreateChat'
import { ChatType } from '@/hooks/mf/chat/useChatList'
import { useRouter } from 'next/router'

function HomePage() {
  const [type, setType] = useState<ChatType>('rag')
  const [fileId, setFileId] = useState('')
  // 逐字动画逻辑
  const fullText = '我能帮你做点儿什么？'
  const [displayText, setDisplayText] = useState('') // 当前显示的文字
  const [disableCursor, setDisableCursor] = useState(false)
  const [loading, setLoading] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const router = useRouter()
  const createChat = useCreateChat()
  const { newChat } = useChatLayout()

  const send = (msg: string) => {
    if (loading) {
      return
    }
    setLoading(true)
    try {
      createChat(type, fileId).then((data) => {
        router.push(`/rag/${data.id}`, undefined, { shallow: true })
        newChat(data, msg)
      })
    } finally {
      setLoading(false)
    }
  }

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
        <span className={clsx(styles.cursor, disableCursor ? styles.disableCursor : null)} />
      </div>
      <div className={styles.chat_input}>
        <ChatInput
          className={styles.input}
          isUpload={type === 'report'}
          loading={loading}
          disabled={disabled}
          send={send}
        />
      </div>
      <div className={styles.suggestions}>
        <div
          className={clsx(styles.item, type === 'rag' ? styles.item_active : null)}
          onClick={() => {
            setType('rag')
          }}>
          <RagIcon />
          根据需求查找数据
        </div>
        <div
          className={clsx(
            styles.report_margin,
            styles.item,
            type === 'report' ? styles.item_active : null
          )}
          onClick={() => {
            setType('report')
          }}>
          <ReportIcon />
          撰写数据分析报告
        </div>
      </div>
    </div>
  )
}

HomePage.layout = ChatLayout

export default HomePage
