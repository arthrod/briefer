import styles from './index.module.scss'
import UploadIcon from '@/icons/upload.svg'
import SendIcon from '@/icons/send.svg'
import FileIcon from '@/icons/file.svg'
import DeleteIcon from '@/icons/delete.svg'
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import clsx from 'clsx'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { CircleProgress } from '../Progress'
import { LoadingCircle } from '../LoadingCircle'
import { ChatType } from '../../../../chat'
import { Tooltip } from '@/components/Tooltips'

interface IProps {
  className?: string
  showUpload: boolean
  value?: string
  chatType: ChatType
  loading?: boolean
  onSend?: (question: string, fileId?: string) => Promise<void>
  onStop?: () => void
}

const ChatInput = ({
  className,
  showUpload,
  chatType,
  value,
  loading = false,
  onSend,
  onStop,
}: IProps) => {
  const [question, setQuestion] = useState('')
  const [disabled, setDisabled] = useState(true)

  const [fileId, setFileId] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [shake, setShake] = useState(false)

  const questionRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadPercent, setUploadPercent] = useState(0)

  useEffect(() => {
    setDisabled(!question)
  }, [question])

  useEffect(() => {
    if (value !== null && value !== undefined) {
      setQuestion(value)
    }
  }, [value])

  useEffect(() => {
    resetUpload()
  }, [chatType])

  const handleFileChangeEvent = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0]
      setUploadFileName(file.name)
      const formData = new FormData()

      // 处理文件名编码
      const fileName = encodeURIComponent(file.name)
      formData.append('file', file, fileName)

      setIsOpen(true)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', NEXT_PUBLIC_MF_API_URL() + '/upload/file', true)
      xhr.withCredentials = true
      // 设置请求头，确保服务器知道文件名是 URL 编码的
      xhr.setRequestHeader('X-File-Name', fileName)

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100
          setUploadPercent(percentComplete)
        }
      }

      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          console.log('上传完成')
        }
      }

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText)
          setFileId(response?.data?.id)
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        } else {
          console.error('上传失败:', xhr.statusText)
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
            setUploadPercent(-1)
          }
        }
      }

      xhr.onabort = () => {
        console.error('上传中断')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
          setUploadPercent(-1)
        }
      }

      xhr.onerror = () => {
        console.error('上传出错')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
          setUploadPercent(-1)
        }
      }

      // 存储xhr引用以便可以取消
      xhrRef.current = xhr
      xhr.send(formData)
    }
  }

  const handleSend = () => {
    if (loading) {
      return
    }
    if (uploadPercent > 0 && uploadPercent < 100) {
      return
    }

    if (onSend) {
      onSend(question, fileId)
        .then(() => {
          setQuestion('')
          if (questionRef.current) {
            questionRef.current.value = ''
          }
        })
        .catch((e) => {
          if (e === 'noFile') {
            setShake(true)
            setTimeout(() => {
              setShake(false)
            }, 500)
          }
        })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (loading) {
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const resetUpload = () => {
    setFileId('')
    setUploadFileName('')
    setUploadPercent(-2)
    setIsOpen(false)

    if (xhrRef.current) {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      xhrRef.current.abort()
      xhrRef.current = null
    }
  }

  return (
    <div className={clsx(styles.chatInput, className, !showUpload ? styles.hiddenPrefix : null)}>
      <div className={styles.inputWrapper}>
        <span
          className={clsx(styles.prefix, shake ? styles.shakeAnimate : '')}
          onClick={() => fileInputRef.current?.click()}>
          <Tooltip tooltipClassname="w-20" active={true} position="top" message="添加附件">
            <UploadIcon />
          </Tooltip>
        </span>
        <input
          ref={questionRef}
          type="text"
          className={clsx(styles.input)}
          value={question}
          placeholder="向AI助手描述需求"
          onChange={(e) => {
            setQuestion(e.target.value)
          }}
          onKeyDown={handleKeyDown}
        />
        {uploadPercent > 0 && uploadPercent < 100 ? (
          <button className={clsx(styles.sendBtn, styles.loading)}>
            <LoadingCircle />
          </button>
        ) : loading ? (
          <button
            className={clsx(styles.sendBtn, styles.loading)}
            onClick={(e) => {
              if (loading) {
                onStop && onStop()
              }
            }}>
            <span className={styles.stopSquare}></span>
          </button>
        ) : (
          <button
            className={clsx(
              styles.sendBtn,
              question ? styles.activate : '',
              disabled ? styles.disabled : ''
            )}
            onClick={() => {
              handleSend()
            }}
            disabled={disabled}>
            <SendIcon />
          </button>
        )}
      </div>
      <div
        style={{ display: isOpen ? 'flex' : 'none' }}
        className={clsx(styles.uploadPopover, uploadPercent === -1 ? styles.error : '')}>
        <div className={styles.info}>
          <FileIcon />
          <div className={styles.fileName}>{uploadFileName}</div>
          <div className={styles.opts}>
            {uploadPercent === 0 ? '未开始' : ''}
            {uploadPercent > 0 && uploadPercent < 100 ? (
              <CircleProgress percent={uploadPercent} />
            ) : (
              ''
            )}
            {uploadPercent === -1 || uploadPercent === 100 ? (
              <div
                className={styles.icon}
                onClick={() => {
                  resetUpload()
                }}>
                {uploadPercent === -1 ? '上传失败' : ''}
                <DeleteIcon />
              </div>
            ) : (
              ''
            )}
          </div>
        </div>
      </div>
      <input ref={fileInputRef} type="file" onChange={handleFileChangeEvent} hidden />
    </div>
  )
}

export default ChatInput
