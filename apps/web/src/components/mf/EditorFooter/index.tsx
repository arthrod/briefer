import { useEnvironmentStatus } from '@/hooks/useEnvironmentStatus'
import styles from './index.module.scss'
import * as dfns from 'date-fns'
import { EnvironmentStatus } from '@briefer/database/types/environments'
import { ArrowPathIcon } from '@heroicons/react/24/solid'

type BadgeProps = {
  children: React.ReactNode
}

const LoadingBadge = ({ children }: BadgeProps) => {
  return (
    <span className="inline-flex items-center gap-x-1.5 rounded-full px-3 py-1 text-xs font-medium text-blue-700">
      <svg className={`h-1.5 w-1.5 fill-blue-500`} viewBox="0 0 6 6" aria-hidden="true">
        <circle cx={3} cy={3} r={3} />
      </svg>
      <span className="text-xs">{children}</span>
    </span>
  )
}
const RedBadge = ({ children }: BadgeProps) => {
  return (
    <span className="inline-flex items-center gap-x-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-700">
      <svg className={`h-1.5 w-1.5 fill-red-500`} viewBox="0 0 6 6" aria-hidden="true">
        <circle cx={3} cy={3} r={3} />
      </svg>
      <span className="text-xs">{children}</span>
    </span>
  )
}

const GrayBadge = ({ children }: BadgeProps) => {
  return (
    <span className="inline-flex items-center gap-x-1.5 rounded-full px-3 py-1 text-xs font-medium text-gray-600">
      <svg className={`h-1.5 w-1.5 fill-gray-400`} viewBox="0 0 6 6" aria-hidden="true">
        <circle cx={3} cy={3} r={3} />
      </svg>
      <span className="text-xs">{children}</span>
    </span>
  )
}

const GreenBadge = ({ children }: BadgeProps) => {
  return (
    <span className="inline-flex items-center gap-x-1.5 rounded-full px-3 py-1 text-xs font-medium text-green-700">
      <svg className={`h-1.5 w-1.5 fill-green-500`} viewBox="0 0 6 6" aria-hidden="true">
        <circle cx={3} cy={3} r={3} />
      </svg>
      <span className="text-xs">{children}</span>
    </span>
  )
}

const YellowBadge = ({ children }: BadgeProps) => {
  return (
    <span className="inline-flex items-center gap-x-1.5 rounded-full px-3 py-1 text-xs font-medium text-yellow-800">
      <svg className={`h-1.5 w-1.5 fill-yellow-500`} viewBox="0 0 6 6" aria-hidden="true">
        <circle cx={3} cy={3} r={3} />
      </svg>
      <span className="text-xs">{children}</span>
    </span>
  )
}
const StatusBadge = ({
  loading,
  status,
  onRestart,
}: {
  loading: boolean
  status: EnvironmentStatus | null
  onRestart: () => void
}) => {
  if (loading) {
    return <LoadingBadge>加载中</LoadingBadge>
  }

  switch (status) {
    case 'Starting':
      return <YellowBadge>启动中</YellowBadge>
    case 'Running':
      return (
        <GreenBadge>
          <div className="flex items-center gap-x-2">
            <div>运行中</div>
            <div className="group relative flex items-center">
              <button onClick={onRestart} className="text-green-700 hover:text-green-900">
                <ArrowPathIcon className="h-3 w-3" />
              </button>
              <div className="bg-hunter-950 pointer-events-none absolute -top-2 right-0 flex w-max -translate-y-full items-center justify-center gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                重启环境
              </div>
            </div>
          </div>
        </GreenBadge>
      )
    case 'Stopped':
      return <GrayBadge>已停止</GrayBadge>
    case 'Stopping':
      return <YellowBadge>停止中</YellowBadge>
    case 'Failing':
      return <RedBadge>失败</RedBadge>
  }

  return <GrayBadge>已停止</GrayBadge>
}

interface Props {
  workspaceId: string
  blockCount: number
  lastEditTime: string | null
}
const EditorFooter = ({ blockCount, lastEditTime, workspaceId }: Props) => {
  const { status, loading, restart } = useEnvironmentStatus(workspaceId)

  return (
    <div className={styles.editorFooter}>
      <div className={styles.left}>{blockCount} Blocks</div>
      <div className={styles.right}>
        {lastEditTime ? (
          <span>上次编辑：{dfns.format(new Date(lastEditTime), 'yyyy-MM-dd HH:mm')}</span>
        ) : null}
        <div className="flex items-center">
          资源状态
          <StatusBadge loading={loading} status={status} onRestart={restart} />
        </div>
      </div>
    </div>
  )
}
export default EditorFooter
