import { useState } from 'react'
import ScrollBar from '../../ScrollBar'
import styles from './index.module.scss'
import clsx from 'clsx'
import { Markdown } from '../markdown'

const content =
  '我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？'
const ChatDetail = () => {
  const [list, setList] = useState([{}])

  const onRightClick = (e: any) => {}

  return (
    <ScrollBar className={styles.chatList}>
      {list.length ? (
        list.map((message, index) => (
          <div className={clsx(styles.chatItem, styles.user)}>
            <span className={styles.robot}>
              <img width={14} src="/icons/logo.svg" alt="" />
            </span>
            <div className={styles.content}>
              <Markdown key={index} content={content} />
            </div>
          </div>
        ))
      ) : (
        <div className={styles.chatItem}>
          <span className={styles.robot}>
            <img width={14} src="/icons/logo.svg" alt="" />
          </span>
          <div className={styles.content}>我是您的AI小助手</div>
        </div>
      )}
    </ScrollBar>
  )
}
export default ChatDetail
