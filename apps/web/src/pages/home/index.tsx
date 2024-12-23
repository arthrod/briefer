import React, { useCallback, useEffect, useRef, useState } from 'react'

import styles from './index.module.scss'
import ChatInput from '@/components/mf/ChatInput'

import RagIcon from '@/icons/rag.svg'
import ReportIcon from '@/icons/report.svg'
import ChatLayout, { useChatLayoutContext } from '@/components/mf/ChatLayout'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import { showToast } from '@/components/mf/Toast'
import { useDocuments } from '@/hooks/useDocuments'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { ChatType } from '../../../chat'

const fullText = '我能帮你做点什么？'

function HomePage() {
  const [chatType, setChatType] = useState<ChatType>('')
  const [question, setQuestion] = useState('') // 当前显示的文字
  // 逐字动画逻辑
  const [displayText, setDisplayText] = useState('') // 当前显示的文字
  const [disableCursor, setDisableCursor] = useState(false)
  const [translateY, setTranslateY] = useState(0) // State to control translation
  const [changePage, setChangePage] = useState(false)
  const [loading, setLoading] = useState(false)
  const chatInputRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const { setRoundList, createChat, startRoundChat } = useChatLayoutContext()
  const [workspaces] = useWorkspaces()
  const workspaceId = workspaces.data[0]?.id || ''
  const [_, { createDocument }] = useDocuments(workspaceId)

  const handleSend = async (msg: string, _fileId?: string) => {
    if (loading) {
      return Promise.reject('')
    }
    if (chatType === 'report' && !_fileId) {
      showToast('请上传报告模版', 'warning')
      return Promise.reject('noFile')
    }
    setLoading(true)
    try {
      // 创建对话
      createChat(chatType, _fileId).then((data) => {
        createRound(data.id, msg, data.workspaceId, data.documentId)
      })
    } finally {
      setLoading(false)
    }
  }

  const createRound = (chatId: string, msg: string, workspaceId?: string, documentId?: string) => {
    createDocument({ version: 2 })

    startRoundChat(chatId, msg).then(() => {
      if (chatType === 'rag') {
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
        setTimeout(() => {
          router.push(
            `/workspaces/${workspaceId}/documents/${documentId}/notebook/edit?chatId=${chatId}`,
            undefined,
            { shallow: true }
          )
        }, 300)
      }
    })
  }

  useEffect(() => {
    let index = 0
    setRoundList([])
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
          chatType={chatType}
          value={question}
          showUpload={chatType === 'report'}
          loading={loading}
          onSend={handleSend}
        />
      </div>
      <div className={styles.suggestions} style={{ transform: `translateY(${translateY}px)` }}>
        <div
          className={clsx(
            styles.report_margin,
            styles.item,
            chatType === 'report' ? styles.item_active : null
          )}
          onClick={() => {
            setChatType('report')
            setQuestion('基于这份数据分析报告，帮我进行数据产品研发')
          }}>
          <ReportIcon />
          撰写数据分析报告
        </div>
        <div
          className={clsx(styles.item, chatType === 'rag' ? styles.item_active : null)}
          onClick={() => {
            setChatType('rag')
            setQuestion('')
          }}>
          <RagIcon />
          根据需求查找数据
        </div>
      </div>
    </div>
  )
}

HomePage.layout = ChatLayout

export default HomePage
