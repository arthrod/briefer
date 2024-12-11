import {
  Bars3CenterLeftIcon,
  ChartBarIcon,
  CircleStackIcon,
  CodeBracketIcon,
  PencilSquareIcon,
  PlusIcon,
  ChevronDownIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useCallback, useEffect, useRef } from 'react'
import { useState } from 'react'
import { BlockType } from '@briefer/editor'
import { CalendarIcon, QueueListIcon } from '@heroicons/react/24/solid'
import { Menu, Transition } from '@headlessui/react'
import { Table2Icon } from 'lucide-react'

const useClickOutside = (ref: React.RefObject<HTMLDivElement>, callback: () => void) => {
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback()
      }
    },
    [ref, callback]
  )

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [handleClickOutside])
}

interface Props {
  alwaysVisible: boolean
  onAddBlock: (type: BlockType) => void
  isEditable: boolean
  writebackEnabled: boolean
}
function PlusButton(props: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [showOptions, setShowOptions] = useState(false)

  const toggleOptions = useCallback(() => {
    setShowOptions((prev) => !prev)
  }, [setShowOptions])

  useClickOutside(wrapperRef, () => {
    setShowOptions(false)
  })

  const addBlockHandler = useCallback(
    (type: BlockType) => {
      props.onAddBlock(type)
      setShowOptions(false)
    },
    [props.onAddBlock]
  )

  return (
    <div className="group relative w-full py-2" ref={wrapperRef}>
      <button
        className={clsx(
          'flex h-6 w-full items-center justify-center gap-x-2 transition-opacity duration-200 group-hover:opacity-100',
          !props.isEditable && 'invisible',
          props.alwaysVisible || showOptions ? 'opacity-100' : 'opacity-0'
        )}
        onClick={toggleOptions}>
        <div className="h-[1px] w-full bg-gray-200" />
        <div className="flex items-center justify-center gap-x-1 whitespace-nowrap text-[10px] text-gray-400">
          <PlusIcon className="h-3 w-3 text-gray-400" />
          <span>Add block</span>
        </div>
        <div className="h-[1px] w-full bg-gray-200" />
      </button>

      {props.isEditable && (showOptions || props.alwaysVisible) && (
        <BlockList onAddBlock={addBlockHandler} writebackEnabled={props.writebackEnabled} />
      )}
    </div>
  )
}

const TriangleUp = () => {
  return (
    <div className="h-3 w-3 translate-y-1/2 rotate-45 border-l border-t border-gray-200 bg-white"></div>
  )
}

interface BlockListProps {
  onAddBlock: (type: BlockType) => void
  writebackEnabled: boolean
}
function BlockList(props: BlockListProps) {
  const onAddText = useCallback(() => {
    props.onAddBlock(BlockType.RichText)
  }, [props.onAddBlock])

  const onAddPython = useCallback(() => {
    props.onAddBlock(BlockType.Python)
  }, [props.onAddBlock])
  const onAddSQL = useCallback(() => {
    props.onAddBlock(BlockType.SQL)
  }, [props.onAddBlock])
  const onAddVisualization = useCallback(() => {
    props.onAddBlock(BlockType.Visualization)
  }, [props.onAddBlock])
  const onAddPivotTable = useCallback(() => {
    props.onAddBlock(BlockType.PivotTable)
  }, [props.onAddBlock])
  const onAddInput = useCallback(() => {
    props.onAddBlock(BlockType.Input)
  }, [props.onAddBlock])
  const onAddDropdownInput = useCallback(() => {
    props.onAddBlock(BlockType.DropdownInput)
  }, [props.onAddBlock])
  const onAddWriteback = useCallback(() => {
    props.onAddBlock(BlockType.Writeback)
  }, [props.onAddBlock])
  const onAddDateInput = useCallback(() => {
    props.onAddBlock(BlockType.DateInput)
  }, [props.onAddBlock])

  return (
    <div className="absolute z-30 w-full -translate-y-2">
      <div className="relative z-30 flex w-full justify-center">
        <TriangleUp />
      </div>
      <div className="flex w-full items-center justify-center divide-x divide-gray-200 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
        <BlockSuggestion
          icon={<Bars3CenterLeftIcon className="h-4 w-4" />}
          onAdd={onAddText}
          text="富文本"
        />
        <BlockSuggestion
          icon={<CodeBracketIcon className="h-4 w-4" />}
          onAdd={onAddPython}
          text="Python"
        />
        <BlockSuggestion
          icon={<CircleStackIcon className="h-4 w-4" />}
          onAdd={onAddSQL}
          text="SQL"
        />
        <BlockSuggestion
          icon={<ChartBarIcon className="h-4 w-4" />}
          onAdd={onAddVisualization}
          text="可视化"
        />
        <BlockSuggestion
          icon={<Table2Icon className="h-4 w-4" />}
          onAdd={onAddPivotTable}
          text="透视表"
        />
        {props.writebackEnabled && (
          <BlockSuggestion
            icon={<ArrowUpTrayIcon className="h-4 w-4" />}
            onAdd={onAddWriteback}
            text="回写"
          />
        )}
        <MultiBlockSuggestion
          icon={<PencilSquareIcon className="h-4 w-4" />}
          text="变量"
          onAdd={onAddInput}
          options={[
            {
              icon: <PencilSquareIcon className="h-4 w-4" />,
              text: '文本',
              onClick: onAddInput,
            },
            {
              icon: <QueueListIcon className="h-4 w-4" />,
              text: '枚举',
              onClick: onAddDropdownInput,
            },
            {
              icon: <CalendarIcon className="h-4 w-4" />,
              text: '日期',
              onClick: onAddDateInput,
            },
          ]}
        />
      </div>
    </div>
  )
}

type BlockSuggestionProps = {
  icon: JSX.Element
  text: string
  onAdd: () => void
}

function BlockSuggestion(props: BlockSuggestionProps) {
  const onClick = useCallback(() => {
    props.onAdd()
  }, [props.onAdd])

  return (
    <div className="relative z-30 w-full px-1 text-sm">
      <button
        className="transition-100 flex w-full items-center justify-center gap-x-2 rounded-md bg-white p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        onClick={onClick}>
        {props.icon}
        <span>{props.text}</span>
      </button>
    </div>
  )
}

interface MultiBlockSuggestionProps {
  icon: JSX.Element
  text: string
  onAdd: () => void
  options: { icon: JSX.Element; text: string; onClick: () => void }[]
}
function MultiBlockSuggestion(props: MultiBlockSuggestionProps) {
  return (
    <Menu as="div" className="relative z-30 w-full px-1 text-sm">
      <Menu.Button className="transition-100 relative flex w-full items-center justify-center gap-x-2 rounded-md bg-white p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
        {props.icon}
        <span>{props.text}</span>
        <ChevronDownIcon className="h-4 w-4" />
      </Menu.Button>
      <Transition
        as="div"
        className="absolute right-0 z-40"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0">
        <Menu.Items
          as="div"
          className="mt-2 w-44 divide-y divide-gray-200 rounded-md bg-white font-sans shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {props.options.map((option, index) => (
            <Menu.Item key={index}>
              {({ active }) => (
                <button
                  className={clsx(
                    active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                    index === 0 ? 'rounded-t-md' : '',
                    index === props.options.length - 1 ? 'rounded-b-md' : '',
                    'flex w-full items-center gap-x-2 px-4 py-3 text-sm'
                  )}
                  onClick={option.onClick}>
                  {option.icon}
                  {option.text}
                </button>
              )}
            </Menu.Item>
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  )
}

export default PlusButton
