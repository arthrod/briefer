import { useState } from 'react'
import ScrollBar from '../../ScrollBar'
import styles from './index.module.scss'
import clsx from 'clsx'

const ChatDetail = () => {
  const [list, setList] = useState([])
  return (
    <ScrollBar className={styles.chatList}>
      {list.length ? (
        list.map((item) => (
          <div className={clsx(styles.chatItem, styles.user)}>
            <span className={styles.robot}>
              <img width={14} src="/icons/logo.svg" alt="" />
            </span>
            <div className={styles.content}>
              我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？我是您的AI小助手，有什么可以帮您？
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
