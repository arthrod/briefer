import { ExclamationCircleIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/solid'
import * as Y from 'yjs'
import { SQLBlock } from '@briefer/editor'
import { useCallback } from 'react'
import clsx from 'clsx'

function queryNameErrorMessage(err: SQLBlock['dataframeName']['error']): React.ReactNode {
  switch (err) {
    case 'invalid-name':
      return (
        <>
          数据框名称必须是一个有效的 Python 变量名：
          <br />
          它应以字母或下划线开头，后跟字母、数字或下划线，不能包含空格.
        </>
      )
    case 'unexpected':
      return <>Unexpected error occurred while renaming the dataframe. Click this icon to retry.</>
  }
}

interface Props {
  block: Y.XmlElement<SQLBlock>
  disabled?: boolean
}
function DataframeNameInput(props: Props) {
  const dataframeName = props.block.getAttribute('dataframeName')

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!dataframeName) {
        return
      }

      props.block.setAttribute('dataframeName', {
        ...dataframeName,
        newValue: e.target.value,
      })
    },
    [props.block, dataframeName]
  )

  const onBlur = useCallback(() => {
    if (!dataframeName) {
      return
    }

    props.block.setAttribute('dataframeName', {
      ...dataframeName,
      status: 'loading',
    })
  }, [props.block, dataframeName])

  const onRetry = useCallback(() => {
    if (!dataframeName) {
      return
    }

    props.block.setAttribute('dataframeName', {
      ...dataframeName,
      status: 'loading',
      error: undefined,
    })
  }, [props.block, dataframeName])

  if (!dataframeName) {
    return <div>块中缺少数据框名称</div>
  }

  return (
    <div className="relative min-w-[124px]">
      <input
        type="text"
        className={clsx(
          dataframeName.error
            ? 'ring-red-200 focus:ring-red-200'
            : 'ring-gray-200 focus:ring-gray-400',
          'block h-6 w-full rounded-md border-0 bg-transparent py-0 pl-2 pr-6 text-xs text-gray-500 ring-1 ring-inset placeholder:text-gray-400 focus:ring-inset disabled:cursor-not-allowed'
        )}
        placeholder="Dataframe变量名"
        value={dataframeName.newValue}
        onChange={onChange}
        disabled={props.disabled || dataframeName.status !== 'idle'}
        onBlur={onBlur}
      />
      <div className="group absolute inset-y-0 right-0 flex items-center pr-1.5">
        {dataframeName.error ? (
          <>
            <button disabled={dataframeName.error !== 'unexpected'} onClick={onRetry}>
              <ExclamationCircleIcon className="h-4 w-4 text-red-300" aria-hidden="true" />
            </button>

            <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-72 -translate-x-1/2 -translate-y-full scale-0 flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:scale-100 group-hover:opacity-100">
              <span className="inline-flex items-center gap-x-1 text-gray-400">
                <span>{queryNameErrorMessage(dataframeName.error)}</span>
              </span>
            </div>
          </>
        ) : (
          <>
            <QuestionMarkCircleIcon className="h-4 w-4 text-gray-300" aria-hidden="true" />

            <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-72 -translate-x-1/2 -translate-y-full scale-0 flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:scale-100 group-hover:opacity-100">
              <span className="inline-flex items-center gap-x-1 text-center text-gray-400">
                在后续的 Python 块中，使用此变量名来引用结果作为 Pandas 数据框。
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default DataframeNameInput
