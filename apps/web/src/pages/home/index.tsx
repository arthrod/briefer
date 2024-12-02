import React, { useCallback, useEffect, useRef, useState } from 'react'

import styles from './index.module.scss'
import ChatInput from '@/components/mf/ChatInput'

import RagIcon from '@/icons/rag.svg'
import ReportIcon from '@/icons/report.svg'
import ChatLayout, { useChatLayoutContext } from '@/components/mf/ChatLayout'
import clsx from 'clsx'
import { ChatType } from '@/hooks/mf/chat/useChatList'
import { useRouter } from 'next/router'
import { showToast } from '@/components/mf/Toast'

const fullText = '我能帮你做点什么？'

function HomePage() {
  const [type, setType] = useState<ChatType>('rag')
  // 逐字动画逻辑
  const [displayText, setDisplayText] = useState('') // 当前显示的文字
  const [disableCursor, setDisableCursor] = useState(false)
  const [translateY, setTranslateY] = useState(0) // State to control translation
  const [changePage, setChangePage] = useState(false)
  const [loading, setLoading] = useState(false)
  const chatInputRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const { createChat, startRoundChat } = useChatLayoutContext()

  const send = async (msg: string, _fileId?: string) => {
    if (loading) {
      return Promise.reject('')
    }
    if (type === 'report' && !_fileId) {
      showToast('请上传报告模版', 'warning')
      return Promise.reject('noFile')
    }
    setLoading(true)
    try {
      // 创建对话
      createChat(type, _fileId).then((data) => {
        createRound(data.id, msg, data.workspaceId, data.documentId)
      })
    } finally {
      setLoading(false)
    }
  }

  const createRound = (chatId: string, msg: string, workspaceId?: string, documentId?: string) => {
    startRoundChat(chatId, msg).then(() => {
      if (type === 'rag') {
        if (chatInputRef.current) {
          const rect = chatInputRef.current.getBoundingClientRect()
          const distanceFromBottom = window.innerHeight - rect.bottom
          const translationValue = distanceFromBottom - 40
          setTranslateY(translationValue)
        }
        setChangePage(true)
        setTimeout(() => {
          router.push(`/rag/${chatId}`, undefined, { shallow: true })
        }, 300)
      } else {
        router.push(
          `/workspaces/${workspaceId}/documents/${documentId}/notebook/edit?chatId=${chatId}`,
          undefined,
          { shallow: true }
        )
      }
    })
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
          showUpload={type === 'report'}
          loading={loading}
          onSend={send}
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
