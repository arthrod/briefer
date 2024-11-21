import styles from './index.module.scss'
import UploadIcon from '../../../icons/upload.svg'
import SendIcon from '../../../icons/send.svg'
import FileIcon from '../../../icons/file.svg'
import DeleteIcon from '../../../icons/delete.svg'
import { ChangeEvent, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import clsx from 'clsx'
import Spinner from '../Spinner'

interface IProps {
  className?: string
  isUpload: boolean
  send?: (question: string, fileId?: string) => void
  stop?: () => void
}

const ChatInput = forwardRef(({ className, isUpload, send, stop }: IProps, ref) => {
  const [question, setQuestion] = useState('')
  const [fileId, setFileId] = useState('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isDisabled, setIsDisabled] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const questionRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({
    openLoading: openLoading,
    closeLoading: closeLoading,
    disableInput: disableInput,
    enableInput: enableInput
  }))
  const disableInput = () => {
    setIsDisabled(true)
  }
  const enableInput = () => {
    setIsDisabled(false)
  }
  const openLoading = () => {
    setIsLoading(true)
  }
  const closeLoading = () => {
    setIsLoading(false)
  }
  const handleFileChangeEvent = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      //todo 添加上传文件获取服务端返回的id并赋值给fileId
      console.log(e.target.files[0])
    }
  }
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isLoading) {
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault() // 防止默认的换行行为
      if (send) {
        send(question, fileId)
      }
      setQuestion('')
      if (questionRef.current) {
        questionRef.current.value = ''
      }
    }
  }
  useEffect(() => { }, [])
  let prefixClassName = ''
  if (isUpload) {
    prefixClassName = clsx(styles.prefix)
  } else {
    prefixClassName = clsx(styles.prefix, styles.hiddenPrefix)
  }
  return (
    <div className={clsx(styles.chatInput, className)}>
      <Popover open={isOpen}>
        <input
          ref={inputRef}
          type="file"
          onChange={(e) => {
            handleFileChangeEvent(e)
          }}
          hidden
        />
        <span
          className={prefixClassName}
          onClick={() => {
            inputRef.current?.click()
          }}>
          <UploadIcon />
        </span>
        <PopoverTrigger asChild>
          <input
            ref={questionRef}
            type="text"
            className={clsx(styles.input, { [styles.disabled]: isDisabled })}
            placeholder="向AI助手描述需求"
            onChange={(e) => {
              setQuestion(e.target.value)
            }}
            onKeyDown={handleKeyDown}
            disabled={isDisabled || isLoading}
          />
        </PopoverTrigger>
        <button
          className={clsx(styles.sendBtn,
            question ? isLoading ? '' : isDisabled ? '' : styles.activate : '',
            isDisabled ? styles.disabled : '',
            isLoading ? styles.loading : '')}
          onClick={(e) => {
            if (isLoading) {
              if (stop) {
                stop();
              }
            } else {
              if (send) {
                send(question, fileId);
                setQuestion('')
                if (questionRef.current) {
                  questionRef.current.value = ''
                }
              }
            }
          }}
          disabled={isDisabled}
        >
          {isLoading ? (
            <div className={styles.stopSquare}></div>
          ) : (
            <SendIcon />
          )}
        </button>

        <PopoverContent asChild>
          <div className={styles.uploadPopover}>
            <div className={styles.info}>
              <FileIcon />
              <div className={styles.fileName}>数据分析报告.pdf</div>
              <div className={styles.icon}>
                <DeleteIcon />
              </div>
            </div>
            <div className={styles.info}>
              <FileIcon />
              <div className={styles.fileName}>数据分析报告.pdf</div>
              <div className={styles.icon}>
                <DeleteIcon />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
})

export default ChatInput
