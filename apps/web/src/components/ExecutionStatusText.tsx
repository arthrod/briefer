import { format } from 'date-fns'
import { CheckCircleIcon, CloudArrowDownIcon, Cog8ToothIcon } from '@heroicons/react/20/solid'

type LastExecutedStatusTextProps = {
  lastExecutionTime: string
}

export const QuerySucceededText = ({ lastExecutionTime }: LastExecutedStatusTextProps) => {
  return (
    <span className="font-syne flex select-none items-center text-xs text-gray-300">
      <CheckCircleIcon className="mr-1 h-4 w-4" />
      <span className="pt-0.5">
        该查询最后一次执行的时间是 {format(new Date(lastExecutionTime), 'HH:mm yyyy-MM-dd')}
      </span>
    </span>
  )
}

export const LoadingQueryText = () => {
  return (
    <span className="font-syne flex select-none items-center text-xs text-gray-400">
      <CloudArrowDownIcon className="mr-1 h-4 w-4" />
      <span className="pt-0.5">正在执行查询...</span>
    </span>
  )
}

export const LoadingEnvText = () => {
  return (
    <span className="font-syne flex select-none items-center text-xs text-gray-400">
      <Cog8ToothIcon className="mr-1 h-4 w-4" />
      <span className="pt-0.5">正在启动您的环境...</span>
    </span>
  )
}

export const ExecutingPythonText = () => {
  return (
    <span className="font-syne flex select-none items-center text-xs text-gray-400">
      <CloudArrowDownIcon className="mr-1 h-4 w-4" />
      <span className="pt-0.5">正在执行 Python 代码...</span>
    </span>
  )
}

export const PythonSucceededText = ({ lastExecutionTime }: LastExecutedStatusTextProps) => {
  return (
    <span className="font-syne flex select-none items-center text-xs text-gray-300">
      <CheckCircleIcon className="mr-1 h-4 w-4" />
      <span className="pt-0.5">
        这段代码最后一次执行的时间是 {format(new Date(lastExecutionTime), 'HH:mm yyyy-MM-dd')}
      </span>
    </span>
  )
}
