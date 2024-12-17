import { useRunAll } from '@/hooks/mf/runall/useRunAll'
import { getQueryParam } from '@/hooks/useQueryArgs'
import { useYDocState } from '@/hooks/useYDoc'
import { YRunAll, getRunAll, getRunAllAttributes, isRunAllLoading } from '@briefer/editor'
import { PlayIcon, StopIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import React, { useCallback, useState } from 'react'
import * as Y from 'yjs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from './Dialog'
import { Input } from './mf/Input'
import styles from './RunAllV2.module.scss'

interface Props {
  disabled: boolean
  yDoc: Y.Doc
  primary: boolean
  createSuccess?: () => void
}

export default function RunAllV2(props: Props) {
  const { state } = useYDocState<YRunAll>(props.yDoc, getRunAll)
  const [isDialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState(false)
  const chatId = getQueryParam('chatId')
  const createRunAll = useRunAll()

  const handleDialogClose = () => {
    setDialogOpen(false)
    setError(false)
    setName('')
  }

  const run = useCallback(() => {
    state.value.setAttribute('status', 'run-requested')
  }, [state])

  const abort = useCallback(() => {
    state.value.setAttribute('status', 'abort-requested')
  }, [state])

  const onClick = useCallback(() => {
    setDialogOpen(true)
  }, [])

  const submit = useCallback(() => {
    if (!name) {
      setError(true)
      return
    }
    createRunAll(chatId, name).then(() => {
      handleDialogClose()
      props.createSuccess?.()
    })
  }, [name, chatId, createRunAll])

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (error) {
        setError(false)
      }
      setName(event.target.value)
    },
    [error]
  )

  const { total, remaining, status: docRunStatus } = getRunAllAttributes(state.value)
  const current = total - remaining
  const loading = isRunAllLoading(state.value)

  return (
    <div>
      <button
        type="button"
        className={clsx(
          {
            'cursor-not-allowed bg-gray-200':
              props.disabled ||
              docRunStatus === 'abort-requested' ||
              docRunStatus === 'aborting' ||
              docRunStatus === 'schedule-running',
            'bg-primary-200 hover:bg-primary-300': !props.disabled && !loading && props.primary,
            'bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-100':
              !props.disabled && !loading && !props.primary,
            'bg-red-200 hover:bg-red-300':
              !props.disabled &&
              loading &&
              (docRunStatus === 'run-requested' || docRunStatus === 'running'),
          },
          'flex h-[36px] items-center gap-x-1.5 rounded-sm px-3 py-1 text-sm'
        )}
        onClick={onClick}
        disabled={props.disabled || docRunStatus === 'schedule-running'}>
        {loading ? (
          <>
            <StopIcon className="h-4 w-4" />
            {docRunStatus === 'run-requested' || docRunStatus === 'running'
              ? `Running (${current}/${total})`
              : docRunStatus === 'schedule-running'
                ? `Running schedule (${current}/${total})`
                : 'Stopping'}
          </>
        ) : (
          <>
            <PlayIcon className="h-4 w-4" />
            全量运行
          </>
        )}
      </button>
      <AlertDialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>创建全量运行记录</AlertDialogTitle>
          <AlertDialogDescription>
            <Input
              value={name}
              onChange={handleChange}
              className={error ? 'border-red-500' : ''}
              placeholder="请输入全量记录的名称"
            />
            {error && <div className={styles.errorHint}>全量记录的名称不能为空</div>}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                handleDialogClose()
              }}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                submit()
              }}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
