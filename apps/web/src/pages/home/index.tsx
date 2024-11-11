import React from 'react'

import styles from './index.module.scss'
import ChatInput from '@/components/mf/ChatInput'

import RagIcon from '../../icons/rag.svg'
import ReportIcon from '../../icons/report.svg'
import ChatLayout from '@/components/mf/ChatLayout'

function HomePage() {
  return (
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
  )
}

HomePage.layout = ChatLayout
export default HomePage
