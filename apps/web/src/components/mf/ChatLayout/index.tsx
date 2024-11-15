import { ChatList, HistoryChat, useChatList } from '@/hooks/mf/chat/useChatList'
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { clsx } from 'clsx'
import { useRouter } from 'next/router'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NoData } from '@/components/mf/NoData'

import styles from './index.module.scss'
import ScrollBar from '@/components/ScrollBar'

import Logo from '../../../icons/mind-flow.svg'
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

interface Props {
  children: React.ReactNode
}

const ChatLayout = forwardRef(({ children }: Props, ref) => {
  const [chatList, setChatList] = useState<HistoryChat[]>([])
  const [workspaces] = useWorkspaces()

  const router = useRouter()
  useImperativeHandle(ref, () => ({
    newChat: newChat,
    refreshChatList: handleUpdate,
  }))
  const newChat = (chat: HistoryChat) => {
    setChatList((prevChatList) => [chat, ...prevChatList]);
  }
  const [{ getChatList }] = useChatList()
  useEffect(() => {
    handleUpdate()
  }, [])
  const handleUpdate = () => {
    getChatList().then((data: ChatList) => {
      setChatList(data.list)
    })
  }
  return (
    <div className={clsx(styles.chatLayout)}>
      <div className={clsx(styles.left, 'text-sm')}>
        <div className="flex w-full flex-col">
          <Logo />
        </div>
        <div
          className={styles.createBtn}
          onClick={() => {
            router.push(`/home`)
          }}>
          <img src="/icons/chat-new-line.svg" width={16} height={16} />
          <span>新建对话</span>
        </div>
        <ScrollBar className={styles.chatListWrapper}>
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
        </ScrollBar>
      </div>
      <div className={styles.main}>{children}</div>
    </div>
  )
})

export default ChatLayout
