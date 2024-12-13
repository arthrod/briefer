import { useCallback, useEffect, useState, useRef } from 'react'
import styles from './index.module.scss'
import clsx from 'clsx'
import { ChatType, MessageContent } from '@/hooks/mf/chat/useChatDetail'
import { useSession } from '@/hooks/useAuth'
import ScrollBar from '@/components/ScrollBar'
import Pointer from '../Pointer'
import Markdown from '../markdown'
import ReportStep, { ContentJsonType, StepJsonType } from './ReportStep'
export interface ChatDetailProps {
  type: ChatType
  loading?: boolean
  roundList: MessageContent[]
  onRegenerate: (message: MessageContent) => void
}

const ChatDetail = ({ type, roundList, loading = false, onRegenerate }: ChatDetailProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  const session = useSession()

  const firstLetter = session.data?.loginName.charAt(0).toUpperCase() // 获取用户名的第一个字母并转为大写

  useEffect(() => {
    setTimeout(scrollToBottom, 100)
  }, [roundList])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current
      const targetScrollTop = scrollElement.scrollHeight
      const currentScrollTop = scrollElement.scrollTop
      const distance = targetScrollTop - currentScrollTop
      const duration = 300 // 设置滚动持续时间（毫秒）
      const startTime = performance.now()

      const animateScroll = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1) // 计算进度
        scrollElement.scrollTop = currentScrollTop + distance * easeInOutQuad(progress)

        if (elapsed < duration) {
          requestAnimationFrame(animateScroll)
        }
      }

      // 缓动函数
      const easeInOutQuad = (t: number) => {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      }

      requestAnimationFrame(animateScroll)
    }
  }, [])

  const getMessageElm = useCallback(
    (message: MessageContent, index: number) => {
      if (message.role === 'system') {
        return (
          <div className={clsx(styles.chatItem, styles.robot)} key={index}>
            <span className={styles.robot}>
              <img width={14} src="/icons/logo.svg" alt="" />
            </span>
            <div className={styles.content}>
              <Markdown>{message.content}</Markdown>
              {!!(loading && index === roundList.length - 1) ? <Pointer /> : null}
            </div>
          </div>
        )
      } else if (message.role === 'assistant') {
        let contentJson: ContentJsonType = { type: 'text', content: '' }
        if (type === 'rag') {
          contentJson.content = message.content
        } else if (type === 'report') {
          contentJson = JSON.parse(message.content) as ContentJsonType
        }

        return (
          <div className={clsx(styles.chatItem, styles.robot)} key={index}>
            <span className={styles.robot}>
              <img width={14} src="/icons/logo.svg" alt="" />
            </span>
            {message.isError ? (
              <div className={styles.errorContent}>
                <div>发生错误。服务器发生错误，或者在处理您的请求时出现了其他问题</div>
                <div className={styles.buttonWrapper}>
                  <div className={styles.errorButton} onClick={() => onRegenerate(message)}>
                    点击重新生成
                  </div>
                </div>
              </div>
            ) : contentJson.type === 'step' ? (
              <ReportStep jobs={contentJson.content.jobs}></ReportStep>
            ) : (
              <div className={styles.content}>
                <Markdown>{message.content}</Markdown>
                {!!(loading && index === roundList.length - 1) ? <Pointer /> : null}
              </div>
            )}
          </div>
        )
      }
      return (
        <div className={clsx(styles.chatItem, styles.user)} key={index}>
          <div className={styles.userAvatar}>{firstLetter}</div>
          <div className={styles.content}>
            <span key={index}>{message.content}</span>
          </div>
        </div>
      )
    },
    [loading, roundList]
  )

  return (
    <ScrollBar ref={scrollRef} className={styles.chatDetailLayout}>
      {(roundList || []).map((message, index) => {
        return getMessageElm(message, index)
      })}
    </ScrollBar>
  )
}

export default ChatDetail
