import Ansi from '@cocalc/ansi-to-react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useCallback } from 'react'
import { SparklesIcon } from '@heroicons/react/20/solid'
import { PythonErrorOutput } from '@briefer/types'
import Spin from '@/components/Spin'
import { Tooltip } from '@/components/Tooltips'

interface Props {
  error: PythonErrorOutput
  isFixWithAILoading: boolean
  onFixWithAI: (error: PythonErrorOutput) => void
  canFixWithAI: boolean
}
function PythonError(props: Props) {
  const onFixWithAI = useCallback(() => {
    props.onFixWithAI(props.error)
  }, [props.error, props.onFixWithAI])

  return (
    <PythonErrorUI
      canFixWithAI={props.canFixWithAI}
      ename={props.error.ename}
      evalue={props.error.evalue}
      traceback={props.error.traceback}
      isFixWithAILoading={props.isFixWithAILoading}
      onFixWithAI={onFixWithAI}
    />
  )
}

export default PythonError

interface PythonErrorUIProps {
  ename: string
  evalue: string
  traceback: string[]
  isFixWithAILoading: boolean
  onFixWithAI?: () => void
  canFixWithAI: boolean
}
export function PythonErrorUI(props: PythonErrorUIProps) {
  return (
    <div className="pt-4 text-xs">
      <div className="flex gap-x-3 overflow-hidden border border-red-300 p-2 text-xs">
        <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
        <div>
          <h4 className="mb-2 font-semibold">你的代码不能执行</h4>
          <p>We received the following error:</p>
          <pre className="whitespace-pre-wrap">
            {props.ename} - {props.evalue}
          </pre>
          {props.traceback.map((line, i) => (
            <pre key={i} className="whitespace-pre-wrap">
              <Ansi>{line}</Ansi>
            </pre>
          ))}
          {props.onFixWithAI && (
            <Tooltip
              // title="敬请期待"
              message="敬请期待"
              className="inline-block"
              tooltipClassname="w-40 text-center"
              position="top"
              active={!props.canFixWithAI}>
              <button
                onClick={props.onFixWithAI}
                className={clsx(
                  'font-syne mt-2 flex items-center gap-x-2 rounded-sm border border-gray-200 px-2 py-1 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-200'
                )}
                disabled={props.isFixWithAILoading || !props.canFixWithAI}>
                {props.isFixWithAILoading ? <Spin /> : <SparklesIcon className="h-3 w-3" />}
                AI修复
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}
