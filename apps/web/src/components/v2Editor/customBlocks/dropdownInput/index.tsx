import { Cog6ToothIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid'
import * as Y from 'yjs'
import {
  YBlock,
  type DropdownInputBlock,
  getDropdownInputAttributes,
  updateDropdownInputLabel,
  updateDropdownInputValue,
  getDropdownInputVariableExecStatus,
  getDropdownInputValueExecStatus,
  dropdownInputToggleConfigOpen,
  dropdownInputRequestSaveValue,
  updateDropdownInputVariable,
  dropdownInputRequestSaveVariable,
} from '@briefer/editor'
import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import Spin from '@/components/Spin'
import { ConnectDragPreview } from 'react-dnd'
import { ClockIcon } from '@heroicons/react/20/solid'
import DropdownSettings from './dropdownSettings'
import { DataFrame } from '@briefer/types'
import useEditorAwareness from '@/hooks/useEditorAwareness'
import { Combobox } from '@headlessui/react'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/20/solid'

function errorMessage(
  error: DropdownInputBlock['variable']['error'],
  options: DropdownInputBlock['options']
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
      return (
        <>
          值无效:
          <br />
          必须是下拉选项内容之一:
          <br />
          {options.map((option) => (
            <div key={option}>{option}</div>
          ))}
        </>
      )
    }
    case 'unexpected-error':
      return <>更新输入时发生意外错误，单击此图标以重试。</>
  }
}

interface Props {
  block: Y.XmlElement<DropdownInputBlock>
  blocks: Y.Map<YBlock>
  dragPreview: ConnectDragPreview | null
  belongsToMultiTabGroup: boolean
  isEditable: boolean
  isApp: boolean
  isDashboard: boolean
  dataframes: Y.Map<DataFrame>
  onRun: (block: Y.XmlElement<DropdownInputBlock>) => void
  isCursorWithin: boolean
  isCursorInserting: boolean
}
function DropdownInputBlock(props: Props) {
  const attrs = getDropdownInputAttributes(props.block, props.blocks)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(attrs.value.newValue ?? '')

  const filteredOptions =
    query === ''
      ? attrs.options
      : attrs.options.filter((option) => option.toLowerCase().includes(query.toLowerCase()))
  const blockId = attrs.id

  const onChangeLabel = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateDropdownInputLabel(props.block, e.target.value)
    },
    [props.block]
  )

  const onRetryValue = useCallback(() => {
    dropdownInputRequestSaveValue(props.block)
  }, [props.block])

  const toggleConfigOpen = useCallback(() => {
    dropdownInputToggleConfigOpen(props.block)
  }, [props.block])

  const isLoadingDropdownInputValue = getDropdownInputValueExecStatus(props.block) !== 'idle'

  const dropdownInputValueExecStatus = getDropdownInputValueExecStatus(props.block)

  const dropdownInputVariableExecStatus = getDropdownInputVariableExecStatus(
    props.block,
    props.blocks
  )

  const onChangeVariable = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateDropdownInputVariable(props.block, props.blocks, {
        newValue: e.target.value,
      })
    },
    [props.block, props.blocks]
  )

  const onBlurVariable: React.FocusEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (attrs.variable.newValue !== attrs.variable.value) {
        updateDropdownInputVariable(props.block, props.blocks, {
          newValue: e.target.value.trim(),
          status: 'save-requested',
          error: null,
        })
      }
    },
    [props.block, props.blocks, attrs]
  )

  const onRetryVariable = useCallback(() => {
    dropdownInputRequestSaveVariable(props.block)
  }, [props.block])

  const selectRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (props.isCursorWithin && props.isCursorInserting) {
      selectRef.current?.focus()
    }
  }, [props.isCursorWithin, props.isCursorInserting])

  const [, editorAPI] = useEditorAwareness()
  const onFocus = useCallback(() => {
    editorAPI.insert(blockId, { scrollIntoView: false })
  }, [blockId, editorAPI.insert])

  const unfocusOnEscape = useCallback((e: React.KeyboardEvent<HTMLUListElement>) => {
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
        <div className="flex items-center justify-between pb-1.5">
          <div className="flex flex-grow items-center space-x-1">
            <input
              data-bounding-rect="true"
              className="block w-full border-0 bg-transparent p-0 text-sm font-medium leading-6 text-gray-900 ring-0 focus:ring-0"
              type="text"
              value={attrs.label}
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
                          attrs.variable.error && dropdownInputVariableExecStatus === 'idle',
                        'text-ceramic-500 bg-ceramic-100':
                          !attrs.variable.error && dropdownInputVariableExecStatus === 'idle',
                        'bg-gray-100 text-gray-300': dropdownInputVariableExecStatus === 'loading',
                      }
                    )}
                    type="text"
                    value={attrs.variable.newValue}
                    onChange={onChangeVariable}
                    onBlur={onBlurVariable}
                    disabled={dropdownInputVariableExecStatus !== 'idle' && dropdownInputVariableExecStatus !== 'error'}
                  />
                  <div className="group absolute inset-y-0 z-10 flex items-center pl-1">
                    {(attrs.variable.error || dropdownInputVariableExecStatus !== 'idle') &&
                      (dropdownInputVariableExecStatus === 'loading' ? (
                        <Spin />
                      ) : dropdownInputVariableExecStatus === 'enqueued' ? (
                        <ClockIcon className="h-4 w-4 text-gray-300" />
                      ) : attrs.variable.error ? (
                        <>
                          <button
                            disabled={attrs.variable.error === null}
                            onClick={onRetryVariable}>
                            <ExclamationCircleIcon
                              className="h-3 w-3 text-red-300"
                              aria-hidden="true"
                            />
                          </button>
                          <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-72 -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="inline-flex items-center gap-x-1 text-center text-gray-400">
                              {errorMessage(attrs.variable.error, attrs.options)}
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
          <div className="relative">
            <Combobox
              value={selected}
              onChange={(value) => {
                setSelected(value)
                updateDropdownInputValue(props.block, { newValue: value })
                props.onRun(props.block)
              }}
              disabled={
                dropdownInputValueExecStatus !== 'idle' || (!props.isEditable && !props.isApp)
              }>
              <Combobox.Button as="div" className="block w-full">
                <div className="relative">
                  <Combobox.Input
                    onFocus={onFocus}
                    onBlur={editorAPI.blur}
                    className={clsx(
                      'block w-full rounded-md border-0 bg-white py-1.5 text-gray-900 shadow-sm ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset disabled:cursor-not-allowed disabled:bg-gray-100',
                      attrs.value.error
                        ? 'ring-red-200 focus:ring-red-200'
                        : 'focus:ring-primary-200',
                      props.isCursorWithin &&
                        !props.isCursorInserting &&
                        !props.belongsToMultiTabGroup
                        ? 'ring-primary-400'
                        : 'ring-gray-200',
                      (isLoadingDropdownInputValue || attrs.value.error) && 'bg-none' // this removes the caret
                    )}
                    displayValue={(value: string) => value}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div
                    className="absolute inset-y-0 bottom-1/2 right-0 inline-block translate-y-1/2 transform px-2.5"
                    onClick={() => setQuery('')}>
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </Combobox.Button>
              <Combobox.Options
                ref={selectRef}
                onKeyDown={unfocusOnEscape}
                className={
                  'absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'
                }>
                {filteredOptions.map((option) => (
                  <Combobox.Option
                    key={option}
                    value={option}
                    className={({ active }) =>
                      clsx(
                        'relative cursor-default select-none py-2 pl-10 pr-4',
                        active ? 'bg-ceramic-100 text-black' : 'text-gray-900'
                      )
                    }>
                    {({ selected, active }) => (
                      <>
                        <span
                          className={clsx(
                            'block truncate',
                            selected ? 'font-medium' : 'font-normal'
                          )}>
                          {option}
                        </span>
                        {selected ? (
                          <span
                            className={clsx(
                              'absolute inset-y-0 left-0 flex items-center pl-3',
                              active ? 'text-white' : 'text-blue-600'
                            )}>
                            <CheckIcon className="h-4 w-4" aria-hidden="true" color="black" />
                          </span>
                        ) : null}
                      </>
                    )}
                  </Combobox.Option>
                ))}
              </Combobox.Options>
            </Combobox>
            <div className="group absolute inset-y-0 right-0 flex items-center pr-2">
              {(attrs.value.error || dropdownInputValueExecStatus !== 'idle') &&
                (dropdownInputValueExecStatus === 'loading' ? (
                  <Spin />
                ) : dropdownInputValueExecStatus === 'enqueued' ? (
                  <ClockIcon className="h-4 w-4 text-gray-300" />
                ) : attrs.value.error ? (
                  <>
                    <button onClick={onRetryValue}>
                      <ExclamationCircleIcon className="h-4 w-4 text-red-300" aria-hidden="true" />
                    </button>
                    <div className="bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 flex w-72 -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="inline-flex items-center gap-x-1 text-gray-400">
                        <span>{errorMessage(attrs.value.error, attrs.options)}</span>
                      </span>
                    </div>
                  </>
                ) : null)}
            </div>
          </div>
          {attrs.configOpen && !props.isApp && props.isEditable && (
            <DropdownSettings
              block={props.block}
              blocks={props.blocks}
              dataframes={props.dataframes}
              onRun={props.onRun}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default DropdownInputBlock
