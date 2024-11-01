import styles from './index.module.scss'
import UploadIcon from '../../../icons/upload.svg'
import SendIcon from '../../../icons/send.svg'
import FileIcon from '../../../icons/file.svg'
import DeleteIcon from '../../../icons/delete.svg'
import clsx from 'clsx'
import { ChangeEvent, useRef, useState } from 'react'

interface IProps {
  className?: string
}

export default function ChatInput({ className }: IProps) {
  const [question, setQuestion] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChangeEvent = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      console.log(e.target.files[0])
    }
  }

  return (
    <div className={clsx(styles.chatInput, className)}>
      <input
        ref={inputRef}
        type="file"
        onChange={(e) => {
          handleFileChangeEvent(e)
        }}
        hidden
      />
      <span
        className={styles.prefix}
        onClick={() => {
          inputRef.current?.click()
        }}>
        <UploadIcon />
      </span>
      <input
        type="text"
        className={clsx(styles.input)}
        placeholder="向AI助手描述需求"
        onChange={(e) => {
          setQuestion(e.target.value)
        }}
      />
      <button className={clsx(styles.sendBtn, question ? styles.activate : '')}>
        <SendIcon />
      </button>
      <div className={styles.uploadPopover}>
        <div className={styles.info}>
          <FileIcon />
          <div className={styles.fileName}>数据分析报告.pdf</div>
          <div className={styles.icon}>
            <DeleteIcon />
          </div>
        </div>
      </div>
    </div>
  )
}
