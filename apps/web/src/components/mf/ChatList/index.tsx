import clsx from 'clsx'
import styles from './index.module.scss'
import { useRouter } from 'next/router'
import { NoData } from '@/components/mf/NoData'
import ScrollBar from '@/components/ScrollBar'

import Logo from '@/icons/mind-flow.svg'
import { HistoryChat } from '@/hooks/mf/chat/useChatList'
import { useChatLayoutContext } from '../ChatLayout'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChatEdit } from '@/hooks/mf/chat/useChatEdit'
import { showToast } from '../Toast'
import Spin from '@/components/Spin'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/Dialog'

import { useDeleteChat } from '@/hooks/mf/chat/useChatDelete'

interface Item {
  type: 'del' | 'edit'
  label: string
}

interface ChatListProps {
  chatId: string
  workspaceId: string
}

interface IMoreBtnProps {
  items: Item[]
  onItemClick?: (type: 'del' | 'edit') => void
}

const MoreBtn = ({ items, onItemClick }: IMoreBtnProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Popover className={styles.moreOpt}>
      <PopoverButton
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}>
        <img src="/icons/more.svg" width={16} />
      </PopoverButton>
      <PopoverPanel
        anchor="bottom"
        className={clsx('pointer-events-auto z-[100] shadow-lg', styles.morePopoverLayout)}
        style={{ marginTop: '8px' }}>
        {({ close }) => (
          <div className={clsx('pointer-events-auto', styles.moreBtnLayout)}>
            {items.map((item, index) => (
              <div
                className={styles.moreBtn}
                key={index}
                onClick={(e) => {
                  e.stopPropagation()
                  onItemClick && onItemClick(item.type)
                  setTimeout(() => close(), 0)
                }}>
                {item.label}
              </div>
            ))}
          </div>
        )}
      </PopoverPanel>
    </Popover>
  )
}

const ChatListBox = ({ chatId, workspaceId }: ChatListProps) => {
  const [updateTitleEvent, setUpdateTitleEvent] = useState<EventSource | null>(null)

  const { chatList, setChatList, setRoundList, refreshChatList } = useChatLayoutContext()
  const [isCommit, setIsCommit] = useState(false)
  const [isDialogOpen, setDialogOpen] = useState(false)

  const delChatId = useRef('')
  const eventTimeoutId = useRef(-1)
  const lastedTimeoutId = useRef(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastedEvent = useRef<EventSource | null>(updateTitleEvent)

  const router = useRouter()

  const editTitle = useChatEdit()
  const deleteChat = useDeleteChat()

  useEffect(() => {
    refreshChatList()
    titleUpdate()
    return () => {
      if (lastedEvent.current) {
        lastedEvent.current.close()
      }
    }
  }, [])

  useEffect(() => {
    lastedTimeoutId.current = eventTimeoutId.current
  }, [eventTimeoutId])

  useEffect(() => {
    lastedEvent.current = updateTitleEvent
  }, [updateTitleEvent])

  const commitTitle = (id: string, title: string) => {
    setIsCommit(true)
    return editTitle(id, title)
      .then(() => {
        showToast('对话更新成功', 'success')
      })
      .finally(() => {
        setIsCommit(false)
      })
  }

  const updateChat = async (chat: HistoryChat, editTitle: string) => {
    if (chat.title !== editTitle) {
      return commitTitle(chat.id, editTitle)
        .then(() => {
          chat.title = editTitle
        })
        .finally(() => {
          chat.isEditing = false
          setChatList((prevItems) =>
            prevItems.map((item) => (item.id === chat.id ? { ...item, newChat: chat } : item))
          )
        })
    } else {
      chat.isEditing = false
      setChatList((prevItems) =>
        prevItems.map((item) => (item.id === chat.id ? { ...item, newChat: chat } : item))
      )
      return Promise.resolve()
    }
  }

  const titleUpdate = useCallback(() => {
    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/mf/chat/title/update`,
      {
        withCredentials: true, // 如果需要发送 cookies
      }
    )
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        setChatList((prevList) => {
          const lastIndex = prevList.findIndex((item) => item.id === data.chatId) // 获取最后一条消息的索引
          const updatedList = [...prevList]
          if (lastIndex >= 0) {
            updatedList[lastIndex] = {
              ...updatedList[lastIndex],
              title: (updatedList[lastIndex].title = data.title), // 将新内容追加到最后一条消息
            }
          }
          return updatedList
        })
      } catch (e) {}
    }
    eventSource.onerror = (error) => {
      eventSource.close()
      eventTimeoutId.current = window.setTimeout(() => {
        titleUpdate()
      }, 5000)
    }
    setUpdateTitleEvent(eventSource)
  }, [chatList])

  const deleteChatById = (id: string) => {
    deleteChat(id).then(() => {
      setDialogOpen(false)
      setChatList((prevChatList) => prevChatList.filter((chat) => chat.id !== id))
      showToast('删除成功', 'success')
      if (chatId === id) {
        router.replace('/home')
      }
    })
  }

  const ChatListItem = useCallback(
    ({ chat }: { chat: HistoryChat }) => {
      const [currentTitle, setCurrentTitle] = useState(chat.title)

      return (
        <div
          className={clsx(
            styles.chatItem,
            chat.id === chatId ? styles.active : '' // 添加选中样式
          )}
          onClick={() => {
            if (chat.id === chatId || chat.isEditing) {
              return
            }
            setRoundList([])

            if (chat.type === 'report') {
              router.push(
                `/workspaces/${workspaceId}/documents/${chat.documentId}/notebook/edit?chatId=${chat.id}`
              )
            } else {
              router.push(`/rag/${chat.id}`)
            }
          }}>
          {chat.isEditing ? (
            <div className={styles.inputBox}>
              <input
                ref={inputRef}
                type="text"
                className={styles.titleInput}
                value={currentTitle}
                onChange={(e) => {
                  setCurrentTitle(e.target.value)
                }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault() // 防止默认的换行行为
                    updateChat(chat, currentTitle).then(() => {
                      inputRef.current?.blur()
                      setCurrentTitle('')
                      refreshChatList();
                    })
                  }
                }}
                onBlur={(e) => {
                  updateChat(chat, currentTitle).then(() => {
                    inputRef.current?.blur()
                    setCurrentTitle('')
                  })
                }}
                autoFocus
              />
              <div className={isCommit ? styles.loadingIcon : styles.loadingIconHidden}>
                <Spin color="#2F69FE" wrapperClassName="pl-2" />
              </div>
            </div>
          ) : (
            <div className={styles.itemTitle}>{chat.title}</div>
          )}
          <MoreBtn
            items={[
              { type: 'edit', label: '编辑标题' },
              { type: 'del', label: '删除' },
            ]}
            onItemClick={(type) => {
              if (type === 'del') {
                setDialogOpen(true)
                delChatId.current = chat.id
              } else if (type === 'edit') {
                setCurrentTitle(chat.title)
                setChatList((prevItems) =>
                  prevItems.map((item) =>
                    item.id === chat.id ? { ...item, isEditing: true } : item
                  )
                )
              }
            }}
          />
        </div>
      )
    },
    [chatList]
  )

  return (
    <div className={clsx(styles.chatList, 'text-sm')}>
      <div className={styles.top}>
        <div
          className={clsx('flex w-full cursor-pointer flex-col', styles.logoBox)}
          onClick={() => {
            router.push('/home')
          }}>
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
      </div>
      <ScrollBar className={styles.chatListWrapper}>
        {chatList.length ? (
          chatList.map((chat) => {
            return <ChatListItem key={chat.id} chat={chat} />
          })
        ) : (
          <NoData className={styles.empty} />
        )}
      </ScrollBar>
      <AlertDialog open={isDialogOpen}>
        <AlertDialogContent style={{ zIndex: 200 }}>
          <AlertDialogHeader>
            <AlertDialogTitle>删除对话</AlertDialogTitle>
            <AlertDialogDescription>确定删除该对话么？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDialogOpen(false)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (delChatId.current) {
                  deleteChatById(delChatId.current)
                }
              }}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ChatListBox
