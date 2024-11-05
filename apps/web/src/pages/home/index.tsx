import { HistoryChat, useChatList } from '@/hooks/useChatList'
import React, { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useRouter } from 'next/router'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import styles from './index.module.scss'
import { NoData } from '@/components/mf/NoData'
import ChatInput from '@/components/mf/ChatInput'

import RagIcon from '../../icons/rag.svg'
import ReportIcon from '../../icons/report.svg'

interface Item {
  type: string
  label: string
}

interface IMoreBtnProps {
  items: Item[]
  onItemClick?: (type: string) => void
}

const MoreBtn = (props: IMoreBtnProps) => {
  const { items, onItemClick } = props
  return (
    <Popover>
      <PopoverTrigger
        className={styles.moreOpt}
        onClick={(e) => {
          e.stopPropagation()
        }}>
        <img src="/icons/more.svg" width={16} />
      </PopoverTrigger>
      <PopoverContent>
        <div>
          {items.map((item, index) => (
            <div
              key={index}
              onClick={() => {
                onItemClick && onItemClick(item.type)
              }}>
              {item.label}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function HomePage() {
  const [chatList, setChatList] = useState<HistoryChat[]>([])
  const [workspaces] = useWorkspaces()

  const router = useRouter()

  const [{ getChatList }] = useChatList()

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
            <span>新建对话</span>
          </div>
          <div className={styles.chatListWrapper}>
            {chatList.length ? (
              chatList.map((item) => {
                return (
                  <div
                    key={item.id}
                    className={styles.chatItem}
                    onClick={() => {
                      if (item.type === 'report') {
                        router.replace(`/workspaces/${workspaces.data[0].id}/documents`)
                      } else {
                        router.push(`/rag/${item.id}`)
                      }
                    }}>
                    <div className={'w-[85%] overflow-hidden text-ellipsis text-nowrap break-keep'}>
                      {item.title}
                    </div>
                    <MoreBtn
                      items={[
                        { type: 'edit', label: '编辑标题' },
                        { type: 'del', label: '删除' },
                      ]}
                      onItemClick={(type) => {
                        console.log(type)
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
