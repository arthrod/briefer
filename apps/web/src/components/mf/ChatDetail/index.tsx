import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useState, useRef } from 'react'
import styles from './index.module.scss'
import clsx from 'clsx'
import { MessageContent, MessageStatus, RagDetailData, useChatDetail } from '@/hooks/mf/chat/useChatDetail'
import { useRouter } from 'next/router'
import { ChatSessionData, useChatSession } from '@/hooks/mf/chat/useChatSession'
import { ChatSession, useChatLayout } from '../ChatLayout'
import { v4 as uuidv4 } from 'uuid';
import { showToast } from '../Toast'
import { useRagDetailLayout } from '@/pages/rag/[chatId]'
import { useSession } from '@/hooks/useAuth'
import RobotMessage from './RobotMessage'
import { ChatStatus, useChatStatus } from '@/hooks/mf/chat/useChatStatus'
import { useChatStop } from '@/hooks/mf/chat/useChatStop'
const defaultMsg = "``` content\n我是你的AI小助手\n```"
export interface ChatDetailProps {
  listChange?: () => void
  receiveMsgDone?: () => void
}
const ChatDetail = forwardRef((props: ChatDetailProps, ref) => {
  const [list, setList] = useState<MessageContent[]>([])
  const [chatSession, setChatSession] = useState<ChatSession | null>(null)
  const [{ createChatSession }] = useChatSession()
  const { startRound } = useChatLayout();
  const [{ getChatStatus }] = useChatStatus();
  const [{ stopChat }] = useChatStop();
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
  const [{ getChatDetail }] = useChatDetail()
  const router = useRouter()
  const chatId = router.query.chatId
  const stopSendMSg = (): void => {
    if (chatSession) {
      stopChat(chatSession.roundId).then(() => {
        chatSession.eventSource.close()
        chatSession.listener.close()
      }).catch(() => {
        showToast('停止失败', '请重试', 'error')
      })
    }
  }

  const addSendMsg = (msg: string): void => {
    if (msg && !waiting) {
      openLoading()
      waiting = true;
      createChatSession(msg, String(chatId)).then((data: ChatSessionData) => {
        const msgId = uuidv4()
        const msgContent: MessageContent = { id: msgId, role: 'user', content: msg, status: 'chatting' };
        setList((messageList) => [...messageList, msgContent])
        const receiveMsg = addReceiveMsg('', 'chatting');
        receiveMsg.roundId = data.id;
        waitingReceive(receiveMsg.id, data.id)
      }).catch((e) => {
        showToast('消息发送失败，请检查网络', '', 'error');
        waiting = false
      })
    }
  }
  const waitingReceive = (msgId: string, roundId: string) => {
    const chatSession = startRound(String(chatId), roundId)
    setChatSession(chatSession)
    const index = list.length + 1;
    console.log(index)
    chatSession.listener.onopen = () => {
      console.log("sse open")
      openLoading();
    }
    chatSession.listener.onerror = (error) => {
      updateMsg(msgId, '服务错误', true)
      console.log("sse error")
      waiting = true
      disableInput();
      closeLoading();
    }
    chatSession.listener.onmessage = (event) => {
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
    chatSession.listener.close = () => {
      console.log("sse close")
      updateMsgStatus(msgId, 'success')
      closeLoading();
    }
  }
  const addReceiveMsg = (msg: string, status: MessageStatus): MessageContent => {
    const msgId = uuidv4()
    const msgContent: MessageContent = {
      id: msgId,
      role: 'assistant',
      content: msg,
      roundId: '',
      status: status
    };
    setList((messageList) => [...messageList, msgContent])
    return msgContent
  }

  const updateMsgStatus = useCallback((id: string, status: MessageStatus): void => {
    setList(prevList =>
      prevList.map(item =>
        item.id === id
          ? { ...item, status: status }  // 如果找到匹配的 id，更新内容
          : item                       // 否则保持不变
      )
    )
  }, []);

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

  const receiveMsgDone = () => {
    chatSession?.eventSource.close();
    chatSession?.listener.close();
    setChatSession(null)
    if (props.receiveMsgDone) {
      props.receiveMsgDone();
    }
  }
  const getSuccessElm = (message: MessageContent, index: number) => {
    return message.isError ? ((<div className={styles.errorContent}>
      <div>发生错误。服务器发生错误，或者在处理您的请求时出现了其他问题</div>
      <div className={styles.buttonWrapper}>
        <div className={styles.errorButton}
          onClick={() => handleRegenerate(message)}
        >点击重新生成</div>
      </div>
    </div>)) :
      (<div className={styles.content} key={index}>
        <RobotMessage content={message.content}
          receiveMsgDone={receiveMsgDone}
        />
        {getChatting(message, index)}
      </div>)
  }
  const getChatting = (message: MessageContent, index: number) => {
    return message.status === 'chatting' ? (
      <div className={styles.chattingContent} key={index}>
        <div className={styles.robotTyping}>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    ) : null
  }
  const getMessageElm = useCallback((message: MessageContent, index: number) => {
    if (message.role === 'system' || message.role === 'assistant') {
      return (
        <div className={clsx(styles.chatItem, styles.robot)} key={index}>
          <span className={styles.robot}>
            <img width={14} src="/icons/logo.svg" alt="" />
          </span>
          {getSuccessElm(message, index)}
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
    return getChatDetail<RagDetailData>(String(chatId), 'rag').then((data) => {
      if (data) {
        data.messages.unshift({ id: '', role: 'system', content: defaultMsg, status: 'success' })
        setList(data.messages);
      }
    })
  }
  // 初始加载数据后滚动到底部
  useEffect(() => {
    if (chatId) {
      loadDetail().then(() => {
        watchStatus()
      });
    }
  }, [chatId, router])

  const watchStatus = (timeoutId?: number) => {
    getChatStatus(String(chatId)).then((data: ChatStatus) => {
      if (data) {
        if (data.status === 'chatting') {
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
