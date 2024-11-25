import React, { useCallback, useEffect, useRef, useState } from 'react'

import styles from './index.module.scss'
import ChatInput from '@/components/mf/ChatInput'

import RagIcon from '../../icons/rag.svg'
import ReportIcon from '../../icons/report.svg'
import ChatLayout, { useChatLayoutContext } from '@/components/mf/ChatLayout'
import clsx from 'clsx'
import { useCreateChat } from '@/hooks/mf/chat/useCreateChat'
import { ChatType } from '@/hooks/mf/chat/useChatList'
import { useRouter } from 'next/router'

function HomePage() {
  const [type, setType] = useState<ChatType>('rag')
  const [fileId, setFileId] = useState<string>('')
  const createChat = useCreateChat()
  const router = useRouter()
  const { newChat } = useChatLayoutContext()
  const chatInputRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [translateY, setTranslateY] = useState(0) // State to control translation
  const [changePage, setChangePage] = useState(false)

  const send = useCallback(
    (msg: string) => {
      if (loading) {
        return
      }

      setLoading(true)
      try {
        createChat(type, fileId).then((data) => {
          if (chatInputRef.current) {
            const rect = chatInputRef.current.getBoundingClientRect()
            const distanceFromBottom = window.innerHeight - rect.bottom
            const translationValue = distanceFromBottom - 40 // Calculate translateY value
            setTranslateY(translationValue) // Update state to trigger CSS transformation
          }

          setChangePage(true)
          newChat(data, msg)
          setTimeout(() => {
            router.push(`/rag/${data.id}`, undefined, { shallow: true })
          }, 300)
        })
      } finally {
        setLoading(false)
      }
    },
    [createChat, fileId, newChat, router, type]
  )

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
    <div className={clsx(styles.container, changePage ? styles.changePage : '')}>
      <div className={styles.title}>
        <div>{displayText}</div>
        <span className={clsx(styles.cursor, disableCursor ? styles.disableCursor : null)} />
      </div>
      <div
        className={styles.chat_input}
        ref={chatInputRef}
        style={{ transform: `translateY(${translateY}px)`, width: '768px' }}>
        <ChatInput
          className={styles.input}
          isUpload={type === 'report'}
          loading={loading}
          disabled={disabled}
          send={send}
        />
      </div>
      <div className={styles.suggestions} style={{ transform: `translateY(${translateY}px)` }}>
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
