import { CalendarIcon, Cog6ToothIcon, InformationCircleIcon } from '@heroicons/react/24/solid'
import clsx from 'clsx'
import { CheckIcon } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { ClockIcon } from '@heroicons/react/24/outline'
import Dropdown from '@/components/Dropdown'
import tzList from 'timezones-list'
import { Tooltip } from '@/components/Tooltips'

interface Props {
  dateType: 'date' | 'datetime'
  onChangeDateType: (type: 'date' | 'datetime') => void
  timezone: string
  onChangeTimeZone: (timezone: string) => void
  disabled: boolean
}
export default function DateSettings(props: Props) {
  const timezoneOptions = useMemo(() => {
    return tzList
      .map((tz) => ({
        label: tz.name,
        value: tz.tzCode,
      }))
      .concat({
        label: 'UTC',
        value: 'UTC',
      })
  }, [])

  const onDateDateType = useCallback(() => {
    props.onChangeDateType('date')
  }, [props.onChangeDateType])

  const onDateTimeDateType = useCallback(() => {
    props.onChangeDateType('datetime')
  }, [props.onChangeDateType])

  return (
    <div className="flex flex-col gap-y-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 shadow-sm">
      <div className="flex w-full items-center justify-between">
        <span className="flex w-full gap-x-1 py-1 text-xs font-semibold text-gray-400">
          <Cog6ToothIcon className="h-4 w-4" />
          日期输入设置
        </span>

        <div>
          <Tooltip
            message="这个字段的值将在 Python 和 SQL 块中作为 datetime 对象使用。在 SQL 中使用时，请将其插入为 {{variable_name}}"
            className="flex w-full"
            tooltipClassname="w-64"
            position="top"
            active>
            <InformationCircleIcon className="h-4 w-4 text-gray-400" />
          </Tooltip>
        </div>
      </div>

      <span className="isolate inline-flex w-full rounded-md shadow-sm">
        <button
          type="button"
          onClick={onDateDateType}
          className={clsx(
            'hover:bg-ceramic-50 relative inline-flex w-full items-center justify-between rounded-l-md px-3 py-2 text-xs ring-1 ring-inset ring-gray-300 focus:z-10',
            props.dateType === 'date'
              ? 'bg-ceramic-50 font-medium text-gray-900'
              : 'bg-white text-gray-500'
          )}
          disabled={props.dateType === 'date' || props.disabled}>
          <span className="flex items-center gap-x-2">
            <CalendarIcon strokeWidth={props.dateType === 'date' ? 2 : 1} className="h-4 w-4" />
            日期
          </span>
          {props.dateType === 'date' && (
            <CheckIcon strokeWidth={3} className="text-ceramic-400 h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onDateTimeDateType}
          className={clsx(
            'hover:bg-ceramic-50 relative -ml-px inline-flex w-full items-center justify-between rounded-r-md px-3 py-2 text-xs ring-1 ring-inset ring-gray-300 focus:z-10',
            props.dateType === 'datetime'
              ? 'bg-ceramic-50 font-medium text-gray-900'
              : 'bg-white text-gray-500'
          )}
          disabled={props.dateType === 'datetime' || props.disabled}>
          <span className="flex items-center gap-x-2">
            <ClockIcon strokeWidth={props.dateType === 'datetime' ? 2 : 1} className="h-4 w-4" />
            带时间的日期
          </span>
          {props.dateType === 'datetime' && (
            <CheckIcon strokeWidth={3} className="text-ceramic-400 h-4 w-4" />
          )}
        </button>
      </span>

      <div className={clsx('flex flex-col gap-y-3 pt-2')}>
        <Dropdown
          label="时区"
          options={timezoneOptions}
          placeholder="Select a dataframe"
          value={props.timezone}
          onChange={props.onChangeTimeZone}
          disabled={props.disabled}
        />
      </div>
    </div>
  )
}
