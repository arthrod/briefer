import { HistoryChat, useChats } from '@/hooks/useChats'
import React, { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useRouter } from 'next/router'
import { useWorkspaces } from '@/hooks/useWorkspaces'

import styles from './index.module.scss'
import { NoData } from '@/components/mf/NoData'
import ChatInput from '@/components/mf/ChatInput'

import RagIcon from '../../icons/rag.svg'
import ReportIcon from '../../icons/report.svg'

export default function Home() {
  const [chatList, setChatList] = useState<HistoryChat[]>([])
  const [workspaces] = useWorkspaces()

  const router = useRouter()

  const [{ getChatList }] = useChats()

  useEffect(() => {
    getChatList().then((res) => {
      setChatList(res)
    })
  }, [])

  return (
    <div className={clsx(styles.home)}>
      <div className={clsx(styles.left, 'text-sm')}>
        <div className={styles.leftTop}>
          <div className="flex w-full flex-col">
            <img height={27} src="/icons/mindflow-logo.png"></img>
          </div>
          <div className={styles.createBtn}>
            <img src="/icons/chat-new-line.svg" width={16} height={16}></img>
            <span className="ml-[8px]">新建对话</span>
          </div>
          <div className={styles.chatListWrapper}>
            {chatList.length ? (
              chatList.map((item) => {
                return (
                  <div
                    key={item.id}
                    className={styles.chatItem}
                    onClick={() => {
                      router.replace(`/workspaces/${workspaces.data[0].id}/documents`)
                    }}>
                    <div
                      className={clsx(
                        'w-[85%] overflow-hidden text-ellipsis text-nowrap break-keep'
                      )}>
                      {item.name}
                    </div>
                    <img
                      className={styles.moreOpt}
                      src="/icons/more.svg"
                      width={16}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    />
                  </div>
                )
              })
            ) : (
              <NoData className={styles.empty} />
            )}
          </div>
        </div>
      </div>
      <div className={styles.main}>
        <div className={styles.container}>
          <div className={styles.title}>我能帮你做点儿什么？</div>
          <ChatInput className={styles.input} />
          <div className={styles.suggestions}>
            <div className={styles.item}>
              <RagIcon />
              根据需求查找数据
            </div>
            <div className={styles.item}>
              <ReportIcon />
              撰写数据分析报告
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
