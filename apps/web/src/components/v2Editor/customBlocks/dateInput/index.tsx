import * as Y from 'yjs'
import { ConnectDragPreview } from 'react-dnd'
import {
  YBlock,
  getDateInputAttributes,
  getDateInputBlockExecStatus,
  updateDateInputBlockDateType,
  updateDateInputBlockTimeZone,
  updateYText,
  type DateInputBlock,
} from '@briefer/editor'
import clsx from 'clsx'
import { useCallback, useEffect, useRef } from 'react'
import { Cog6ToothIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { ClockIcon } from '@heroicons/react/20/solid'
import Spin from '@/components/Spin'
import DateInputBlockInput from './DateInputBlockInput'
import DateSettings from './DateSettings'

function invalidVariableErrorMessage(
  status: 'invalid-variable' | 'invalid-variable-and-value' | 'unexpected-error'
): JSX.Element {
  switch (status) {
    case 'invalid-variable':
    case 'invalid-variable-and-value':
      return (
        <>
          变量名称无效:
          <br />
          变量名称应以字母或下划线开头，后面可以包含字母、数字或下划线。 不允许包含空格。
        </>
      )
    case 'unexpected-error':
      return <>更新输入时发生意外错误。单击此图标重试。</>
  }
}

interface Props {
  block: Y.XmlElement<DateInputBlock>
  blocks: Y.Map<YBlock>
  dragPreview: ConnectDragPreview | null
  belongsToMultiTabGroup: boolean
  isEditable: boolean
  isApp: boolean
  isDashboard: boolean
  onRun: (block: Y.XmlElement<DateInputBlock>) => void
  isCursorWithin: boolean
  isCursorInserting: boolean
}

function DateInput(props: Props) {
  const blockId = props.block.getAttribute('id')
  const attrs = getDateInputAttributes(props.block, props.blocks)
  const onChangeLabel: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      updateYText(attrs.label, e.target.value)
    },
    [attrs.label]
  )

  const toggleConfigOpen = useCallback(() => {
    props.block.setAttribute('configOpen', !Boolean(props.block.getAttribute('configOpen')))
  }, [props.block])

  const onChangeVariable: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      updateYText(attrs.newVariable, e.target.value)
    },
    [attrs.newVariable, props.block]
  )

  const onBlurVariable: React.FocusEventHandler<HTMLInputElement> = useCallback(() => {
    props.onRun(props.block)
  }, [props.block, props.onRun])

  const onSave = useCallback(() => {
    props.onRun(props.block)
  }, [props.block, props.onRun])

  const execStatus = getDateInputBlockExecStatus(props.block)

  const onChangeDateType = useCallback(
    (type: 'date' | 'datetime') => {
      updateDateInputBlockDateType(props.block, props.blocks, type)
      props.onRun(props.block)
    },
    [props.block, props.onRun]
  )

  const onChangeTimeZone = useCallback(
    (timezone: string) => {
      updateDateInputBlockTimeZone(props.block, props.blocks, timezone)
      props.onRun(props.block)
    },
    [props.block, props.blocks, props.onRun]
  )

  return (
    <div
      className={clsx(
        'w-full',
        props.belongsToMultiTabGroup && 'rounded-b-md rounded-tr-md border p-4',
        props.isCursorWithin && !props.isCursorInserting ? 'border-blue-400' : 'border-gray-200'
      )}
      data-block-id={blockId}>
      <div
        className={!props.isDashboard ? 'w-1/2' : ''}
        ref={(d) => {
          if (props.dragPreview) {
            props.dragPreview(d)
          }
        }}>
        <div className="flex items-center justify-between pb-1.5">
          <div className="flex flex-grow items-center space-x-1">
            {/* TODO: use Y.Text the right way */}
            <input
              data-bounding-rect="true"
              className="block w-full border-0 bg-transparent p-0 text-sm font-medium leading-6 text-gray-900 ring-0 focus:ring-0"
              type="text"
              value={attrs.label.toString()}
              onChange={onChangeLabel}
              disabled={!props.isEditable || props.isApp}
            />

            {!props.isApp && props.isEditable && (
              <div className="flex items-center space-x-1">
                <button onClick={toggleConfigOpen}>
                  <Cog6ToothIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                </button>
                <div className={clsx(!props.isEditable && 'hidden', 'relative')}>
                  <input
                    className={clsx(
                      'text-ceramic-500 bg-ceramic-100 block min-h-4 min-w-12 rounded-md border-0 px-1 py-0.5 text-right text-xs font-medium ring-0 focus:ring-0',
                      {
                        'bg-red-100 text-red-500':
                          attrs.status === 'invalid-variable' ||
                          attrs.status === 'invalid-variable-and-value' ||
                          attrs.status === 'unexpected-error',
                        'text-ceramic-500 bg-ceramic-100': execStatus === 'idle',
                        'bg-gray-100 text-gray-300': execStatus === 'loading',
                      }
                    )}
                    type="text"
                    value={attrs.newVariable.toString()}
                    onChange={onChangeVariable}
                    onBlur={onBlurVariable}
                    disabled={execStatus === 'loading' || execStatus === 'enqueued'}
                  />
                  <div className="group absolute inset-y-0 z-10 flex items-center pl-1">
                    {execStatus !== 'idle' &&
                      (execStatus === 'loading' ? (
                        <Spin />
                      ) : execStatus === 'enqueued' ? (
                        <ClockIcon className="h-4 w-4 text-gray-300" />
                      ) : attrs.status === 'invalid-variable' ||
                        attrs.status === 'invalid-variable-and-value' ||
                        attrs.status === 'unexpected-error' ? (
                        <>
                          <button disabled={attrs.status !== 'invalid-variable'} onClick={onSave}>
                            <ExclamationCircleIcon
                              className="h-3 w-3 text-red-300"
                              aria-hidden="true"
                            />
                          </button>
                          <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-72 -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="inline-flex items-center gap-x-1 text-center text-gray-400">
                              {invalidVariableErrorMessage(attrs.status)}
                            </span>
                          </div>
                        </>
                      ) : null)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col space-y-1">
          <DateInputBlockInput
            blockId={blockId ?? ''}
            value={attrs.value}
            dateType={attrs.dateType}
            newValue={attrs.newValue}
            onSave={onSave}
            error={
              attrs.status === 'invalid-value' ||
              attrs.status === 'invalid-variable-and-value' ||
              attrs.status === 'unexpected-error'
                ? attrs.status
                : null
            }
            isSaving={execStatus === 'loading'}
            isEnqueued={execStatus === 'enqueued'}
            isEditable={props.isEditable || props.isApp}
            belongsToMultiTabGroup={props.belongsToMultiTabGroup}
            isCursorWithin={props.isCursorWithin}
            isCursorInserting={props.isCursorInserting}
          />

          {attrs.configOpen && !props.isApp && props.isEditable && (
            <DateSettings
              dateType={attrs.dateType}
              onChangeDateType={onChangeDateType}
              timezone={attrs.value.timezone}
              onChangeTimeZone={onChangeTimeZone}
              disabled={execStatus === 'loading' || execStatus === 'enqueued'}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default DateInput
