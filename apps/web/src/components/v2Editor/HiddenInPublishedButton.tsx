import { EyeIcon, EyeSlashIcon } from '@heroicons/react/20/solid'
import { MouseEventHandler, useCallback } from 'react'

interface Props {
  isBlockHiddenInPublished: boolean
  onToggleIsBlockHiddenInPublished: () => void
  hasMultipleTabs: boolean
}
function HiddenInPublishedButton(props: Props) {
  const onToggle: MouseEventHandler<HTMLButtonElement> = useCallback(
    (e) => {
      e.stopPropagation()
      props.onToggleIsBlockHiddenInPublished()
    },
    [props.onToggleIsBlockHiddenInPublished]
  )
  return (
    <button
      onClick={onToggle}
      className="group relative flex h-6 min-w-6 items-center justify-center rounded-sm border border-gray-200 hover:bg-gray-50">
      {props.isBlockHiddenInPublished ? (
        <EyeIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-500" />
      ) : (
        <EyeSlashIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-500" />
      )}
      <div className="bg-hunter-950 pointer-events-none absolute -top-1 left-1/2 flex w-max max-w-40 -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        <span className="inline-flex items-center text-gray-400">
          {`在预览页面${props.isBlockHiddenInPublished ? '展示' : '隐藏'}这个${props.hasMultipleTabs ? 'tab' : 'block'}`}
        </span>
      </div>
    </button>
  )
}

export default HiddenInPublishedButton
