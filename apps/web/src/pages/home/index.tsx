import { HistoryChat, useChats } from '@/hooks/useChats'
import { forEach } from 'ramda'
import React, { useCallback, useEffect, useState } from 'react'
import homeCss from "./index.module.scss";
function Left() {
  return (
    <div
      className={
        'mf-left-top flex flex-col flex-1 bg-[#F4F7FE] h-full w-60 p-[16px]'
      }
    >
      <div className="h-[50%]">
        <div className="flex flex-col w-full">
          <img className="h-[27px]" src="/icons/mindflow-logo.png"></img>
          <div
            className="h-[40px] w-full mt-[19px] border rounded-[8px] mf-home-new-button-bg 
      flex flex-row px-[12px] items-center text-[#2F69FE] text-[14px] cursor-pointer hover:bg-[#DCE6FA]"
          >
            <img
              src="/icons/chat-new-line.svg"
              className="w-[16px] h-[16px]"
            ></img>
            <span className="ml-[8px]">新建对话</span>
          </div>
          <div className="h-[36px] mt-[19px] flex flex-row px-[12px] items-center">
            <img
              src="/icons/search-icon.svg"
              className="w-[16px] h-[16px]"
            ></img>
            <input
              placeholder="搜索历史对话"
              contentEditable="true"
              className="text-[#8792A4] p-[0px] hover:border-transparent text-[14px]
         bg-[#F4F7FE] ml-[8px] border-[0px]"
            />
          </div>
        </div>
        <div className={homeCss.chatListWrapper}>
          <ChatList className="mt-[8px]"></ChatList>
        </div>
      </div>
    </div>
  )
}
interface ChatListProps {
  className?: string
}
function ChatList(props: ChatListProps) {
  const [chatList, setChatList] = useState<HistoryChat[]>([])
  const [{ getChatList }] = useChats()
  useEffect(() => {
    getChatList().then((res) => {
      setChatList(res)
    })
  }, [])
  return (
    <div className={props.className}>
      {chatList.map((item, index) => {
        let mt = ' mt-[4px]'
        if (index <= 0) {
          mt = ''
        }
        let className =
          'flex rounded-[8px] items-center h-[44px] px-[12px] text-[14px] cursor-pointer text-[#272A33] hover:bg-[#DCE6FA]' +
          mt
        return (
          <div key={item.id} className={className}>
            <div className="text-ellipsis">{item.name}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function Home() {
  return (
    <div className={homeCss.chatHome}>
      <Left></Left>
    </div>
  )
}
