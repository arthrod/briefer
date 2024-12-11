import { ExclamationCircleIcon } from '@heroicons/react/24/solid'
import * as Y from 'yjs'
import {
  YBlock,
  type InputBlock,
  getInputAttributes,
  updateInputLabel,
  updateInputValue,
  getInputVariableExecStatus,
  getInputValueExecStatus,
  updateInputVariable,
} from '@briefer/editor'
import clsx from 'clsx'
import { useCallback, useEffect, useRef } from 'react'
import Spin from '@/components/Spin'
import { ConnectDragPreview } from 'react-dnd'
import { ClockIcon } from '@heroicons/react/20/solid'
import useEditorAwareness from '@/hooks/useEditorAwareness'

function errorMessage(
  error: InputBlock['variable']['error'],
  type: InputBlock['inputType']
): React.ReactNode {
  switch (error) {
    case 'invalid-variable-name':
      return (
        <>
          变量名称无效:
          <br />
          变量名称应以字母或下划线开头，后面可以包含字母、数字或下划线。 不允许包含空格。
        </>
      )
    case 'invalid-value': {
      switch (type) {
        case 'text':
          return (
            <>
              The value is invalid:
              <br />
              It should be a valid string.
            </>
          )
      }
    }
    case 'unexpected-error':
      return <>Unexpected error occurred while updating the input. Click this icon to retry.</>
  }
}

interface Props {
  block: Y.XmlElement<InputBlock>
  blocks: Y.Map<YBlock>
  dragPreview: ConnectDragPreview | null
  belongsToMultiTabGroup: boolean
  isEditable: boolean
  isApp: boolean
  isDashboard: boolean
  onRun: (block: Y.XmlElement<InputBlock>) => void
  isCursorWithin: boolean
  isCursorInserting: boolean
}
function InputBlock(props: Props) {
  const attrs = getInputAttributes(props.block, props.blocks)
  const blockId = attrs.id

  const onChangeLabel = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateInputLabel(props.block, e.target.value)
    },
    [props.block]
  )

  const onChangeValue = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateInputValue(props.block, { newValue: e.target.value })
    },
    [props.block]
  )

  const onChangeVariable = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateInputVariable(props.block, props.blocks, {
        newValue: e.target.value,
      })
    },
    [props.block, props.blocks]
  )

  const onBlurVariable: React.FocusEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (attrs.variable.newValue !== attrs.variable.value) {
        updateInputVariable(props.block, props.blocks, {
          newValue: e.target.value.trim(),
          status: 'save-requested',
          error: null,
        })
      }
    },
    [props.block, props.blocks, attrs]
  )

  const onRetryValue = useCallback(() => {
    props.onRun(props.block)
  }, [props.block, props.onRun])

  const onRetryVariable = useCallback(() => {
    updateInputVariable(props.block, props.blocks, {
      status: 'save-requested',
      error: null,
    })
  }, [props.block, props.blocks])

  const inputVariableExecStatus = getInputVariableExecStatus(props.block, props.blocks)
  const inputValueExecStatus = getInputValueExecStatus(props.block)

  const selectRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (props.isCursorWithin && props.isCursorInserting) {
      selectRef.current?.focus()
    }
  }, [props.isCursorWithin, props.isCursorInserting])

  const [, editorAPI] = useEditorAwareness()
  const onFocus = useCallback(() => {
    editorAPI.insert(blockId, { scrollIntoView: false })
  }, [blockId, editorAPI.insert])

  const onBlur = useCallback(() => {
    if (attrs.value.newValue !== attrs.value.value) {
      props.onRun(props.block)
    }

    editorAPI.blur()
  }, [props.block, props.onRun, attrs.value, editorAPI.blur])

  const unfocusOnEscape = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      selectRef.current?.blur()
    }
  }, [])

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
        <div className="flex items-center justify-between pb-1">
          <div className="flex-grow">
            <input
              data-bounding-rect="true"
              className="w-full border-0 bg-transparent p-0 text-sm font-medium leading-6 text-gray-900 ring-0 focus:ring-0"
              type="text"
              value={attrs.label}
              onChange={onChangeLabel}
              disabled={!props.isEditable || props.isApp}
            />
          </div>
          <div className={clsx((!props.isEditable || props.isApp) && 'hidden', 'relative py-0.5')}>
            <input
              className={clsx(
                'text-ceramic-500 bg-ceramic-100 block min-h-4 min-w-12 rounded-md border-0 px-1 py-0.5 text-right text-xs font-medium ring-0 focus:ring-0',
                {
                  'bg-red-100 text-red-500':
                    attrs.variable.error && inputVariableExecStatus === 'idle',
                  'text-ceramic-500 bg-ceramic-100':
                    !attrs.variable.error && inputVariableExecStatus === 'idle',
                  'bg-gray-100 text-gray-300': inputVariableExecStatus === 'loading',
                }
              )}
              type="text"
              value={attrs.variable.newValue}
              onChange={onChangeVariable}
              onBlur={onBlurVariable}
              disabled={inputVariableExecStatus !== 'idle' && inputVariableExecStatus !== 'error'}
            />
            <div className="group absolute inset-y-0 z-10 flex items-center pl-1">
              {(attrs.variable.error || inputVariableExecStatus !== 'idle') &&
                (inputVariableExecStatus === 'loading' ? (
                  <Spin />
                ) : inputVariableExecStatus === 'enqueued' ? (
                  <ClockIcon className="h-4 w-4 text-gray-300" />
                ) : attrs.variable.error ? (
                  <>
                    <button disabled={attrs.variable.error === null} onClick={onRetryVariable}>
                      <ExclamationCircleIcon className="h-3 w-3 text-red-300" aria-hidden="true" />
                    </button>
                    <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-72 -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="inline-flex items-center gap-x-1 text-center text-gray-400">
                        {errorMessage(attrs.variable.error, attrs.inputType)}
                      </span>
                    </div>
                  </>
                ) : null)}
            </div>
          </div>
        </div>
        <div className="relative">
          <input
            ref={selectRef}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={unfocusOnEscape}
            className={clsx(
              'block w-full rounded-md border-0 bg-white py-1.5 text-gray-900 shadow-sm ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset disabled:cursor-not-allowed disabled:bg-gray-100',
              attrs.value.error ? 'ring-red-200 focus:ring-red-200' : 'focus:ring-primary-200',
              props.isCursorWithin && !props.isCursorInserting && !props.belongsToMultiTabGroup
                ? 'ring-blue-400'
                : 'ring-gray-200'
            )}
            type="text"
            value={attrs.value.newValue}
            onChange={onChangeValue}
            disabled={inputValueExecStatus !== 'idle' || (!props.isEditable && !props.isApp)}
          />
          <div className="group absolute inset-y-0 right-0 flex items-center pr-3">
            {(attrs.value.error || inputValueExecStatus !== 'idle') &&
              (inputValueExecStatus === 'loading' ? (
                <Spin />
              ) : inputValueExecStatus === 'enqueued' ? (
                <ClockIcon className="h-4 w-4 text-gray-300" />
              ) : attrs.value.error ? (
                <>
                  <button disabled={attrs.value.error === null} onClick={onRetryValue}>
                    <ExclamationCircleIcon className="h-4 w-4 text-red-300" aria-hidden="true" />
                  </button>
                  <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-72 -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="inline-flex items-center gap-x-1 text-gray-400">
                      <span>{errorMessage(attrs.value.error, attrs.inputType)}</span>
                    </span>
                  </div>
                </>
              ) : null)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default InputBlock
