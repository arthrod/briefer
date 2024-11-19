import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useState, useRef } from 'react'
import ScrollBar from '../../ScrollBar'
import styles from './index.module.scss'
import clsx from 'clsx'
import { Markdown } from '../markdown'
import { ChatType, MessageContent, RagDetailData, useChatDetail } from '@/hooks/mf/chat/useChatDetail'
import { useRouter } from 'next/router'
import { ChatSessionData, useChatSession } from '@/hooks/mf/chat/useChatSession'
import { EventListener, useChatLayout } from '../ChatLayout'
import { v4 as uuidv4 } from 'uuid';
import { showToast } from '../Toast'
import { useRagDetailLayout } from '@/pages/rag/[chatId]'
import { useSession } from '@/hooks/useAuth'
import RobotMessage from './RobotMessage'
import { close } from 'node:inspector/promises'
import { ChatStatus, useChatStatus } from '@/hooks/mf/chat/useChatStatus'
const defaultMsg = "``` content\n我是你的AI小助手\n```"
export interface ChatDetailProps {
  listChange?: () => void
  receiveMsgDone?: () => void
}
const ChatDetail = forwardRef((props: ChatDetailProps, ref) => {
  const [list, setList] = useState<MessageContent[]>([])
  const [blocks, setBlocks] = useState<{ type: string; content: string }[]>([]);
  const [{ createChatSession }] = useChatSession()
  const { startRound } = useChatLayout();
  const [{ getChatStatus }] = useChatStatus();
  const { disableInput, enableInput, openLoading, closeLoading } = useRagDetailLayout()
  const scrollRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => ({
    addSendMsg: addSendMsg,
    addReceiveMsg: addReceiveMsg,
    updateMsg: updateMsg,
    stopSendMsg: stopSendMSg
  }))
  const session = useSession()
  const firstLetter = session.data?.loginName.charAt(0).toUpperCase(); // 获取用户名的第一个字母并转为大写

  let waiting = false;
  let listener: EventListener | null = null;
  const [{ getChatDetail }] = useChatDetail()
  const onRightClick = (e: any) => { }
  const router = useRouter()
  const chatId = router.query.chatId
  const stopSendMSg = (): void => {
    if (listener) {
      listener.close()
    }
  }

  const addSendMsg = (msg: string): void => {
    if (msg && !waiting) {
      openLoading()
      waiting = true;
      createChatSession(msg, String(chatId)).then((data: ChatSessionData) => {
        const msgId = uuidv4()
        const msgContent: MessageContent = { id: msgId, role: 'user', content: msg };
        setList((messageList) => [...messageList, msgContent])
        const receiveMsg = addReceiveMsg('');
        receiveMsg.roundId = data.id;
        waitingReceive(receiveMsg.id, data.id)
      }).catch((e) => {
        showToast('消息发送失败，请检查网络', '', 'error');
        waiting = false
      }).finally(() => {
        closeLoading()
      })
    }
  }
  const waitingReceive = (msgId: string, roundId: string) => {
    listener = startRound(String(chatId), roundId)
    const index = list.length + 1;
    console.log(index)
    const state = { currentType: '', currentContent: [] }
    listener.onopen = () => {
      console.log("sse open")
      openLoading();
    }
    listener.onerror = (error) => {
      updateMsg(msgId, '服务错误', true)
      console.log("sse error")
      waiting = true
      disableInput();
      closeLoading();
    }
    listener.onmessage = (event) => {
      const data = event.data + '\n';
      setList((prevList) => {
        const lastIndex = prevList.length - 1; // 获取最后一条消息的索引
        const updatedList = [...prevList];
        if (lastIndex >= 0) {
          updatedList[lastIndex] = {
            ...updatedList[lastIndex],
            content: updatedList[lastIndex].content += data // 将新内容追加到最后一条消息
          };
        }
        return updatedList;
      });
    }
    listener.close = () => {
      console.log("sse close")
      closeLoading();
    }
  }
  const addReceiveMsg = (msg: string): MessageContent => {
    const msgId = uuidv4()
    const msgContent: MessageContent = { id: msgId, role: 'assistant', content: msg, roundId: '' };
    setList((messageList) => [...messageList, msgContent])
    return msgContent
  }

  const updateMsg = useCallback((id: string, msg: string, error: boolean): void => {
    setList(prevList =>
      prevList.map(item =>
        item.id === id
          ? { ...item, content: msg, isError: error }  // 如果找到匹配的 id，更新内容
          : item                       // 否则保持不变
      )
    )
  }, []);

  const handleRegenerate = (message: MessageContent) => {
    enableInput();
    updateMsg(message.id, '', false)
    if (message.roundId) {
      waitingReceive(message.id, message.roundId)
    }
  }
  const getMessageElm = useCallback((message: MessageContent, index: number) => {
    if (message.role === 'system' || message.role === 'assistant') {
      return (
        <div className={clsx(styles.chatItem, styles.robot)} key={index}>
          <span className={styles.robot}>
            <img width={14} src="/icons/logo.svg" alt="" />
          </span>
          {message.isError ? ((<div className={styles.errorContent}>
            <div>发生错误。服务器发生错误，或者在处理您的请求时出现了其他问题</div>
            <div className={styles.buttonWrapper}>
              <div className={styles.errorButton}
                onClick={() => handleRegenerate(message)}
              >点击重新生成</div>
            </div>
          </div>)) :
            message.content ? (<div className={styles.content}>
              <RobotMessage key={index} content={message.content}
                receiveMsgDone={props.receiveMsgDone}
              />
            </div>) : (<div></div>)}
        </div>
      )
    } else {
      return (
        <div className={clsx(styles.chatItem, styles.user)} key={index}>
          <div className={styles.userAvatar}>
            {firstLetter}
          </div>
          <div className={styles.content}>
            <span key={index}>
              {message.content}
            </span>
          </div>
        </div>)
    }
  }, [handleRegenerate])
  useEffect(() => {
    if (props.listChange) {
      props.listChange();
    }
  }, [list])

  const loadDetail = () => {
    getChatDetail<RagDetailData>(String(chatId), 'rag').then((data) => {
      if (data) {
        data.messages.unshift({ id: '', role: 'system', content: defaultMsg })
        setList(data.messages);
        watchStatus()
      }
    })
  }
  // 初始加载数据后滚动到底部
  useEffect(() => {
    if (chatId) {
      loadDetail();
    }
  }, [chatId, router])

  const watchStatus = (timeoutId?: number) => {
    getChatStatus(String(chatId)).then((data: ChatStatus) => {
      if (data) {
        if (data.status === 'chating') {
          openLoading();
          const id = window.setTimeout(() => {
            watchStatus(id)
          }, 3000)
        } else {
          loadDetail();
          closeLoading();
          window.clearTimeout(timeoutId)
        }
      } else {
        closeLoading();
        window.clearTimeout(timeoutId)
      }
    })
  }
  return (
    <div className={styles.chatList} ref={scrollRef} key={String(chatId)}>
      {list.map((message, index) => (
        getMessageElm(message, index)
      ))}
    </div>
  )
})
export default ChatDetail
