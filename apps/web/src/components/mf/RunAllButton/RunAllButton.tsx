import clsx from 'clsx'
import RunAllIcon from '../../../icons/run-all-icon.svg'
export default function RunAllButton() {
  return (
    <button
      type="button"
      className={clsx(
        {
          'bg-primary-200 hover:bg-primary-300': true,
          'bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-100': true,
        },
        'flex items-center gap-x-1.5 rounded-sm px-3 py-[7px] text-sm'
      )}>
      <>
        <RunAllIcon className="h-4 w-4" />
        运行
      </>
    </button>
  )
}
