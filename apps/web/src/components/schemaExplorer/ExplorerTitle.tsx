import * as dfns from 'date-fns'
import { useCallback } from 'react'
import { APIDataSource, type DataSource } from '@briefer/database'

interface Props {
  title: string
  description: string
  dataSource: APIDataSource | null
  onRetrySchema: (dataSource: DataSource) => void
  canRetrySchema: boolean
}
export default function ExplorerTitle(props: Props) {
  const onRefresh = useCallback(() => {
    if (!props.dataSource) {
      return
    }

    props.onRetrySchema(props.dataSource.config)
  }, [props.dataSource, props.onRetrySchema])

  return (
    <div className="px-6 pb-2 pt-6">
      <h3 className="text-lg font-medium leading-6 text-gray-900">{props.title}</h3>
      <p className="pt-1 text-sm text-gray-500">{props.description}</p>
      {props.canRetrySchema && props.dataSource?.structure.status === 'success' && (
        <div className="pt-1 text-sm text-gray-500">
          Loaded at{' '}
          {dfns.format(new Date(props.dataSource.structure.updatedAt), "h:mm a '-' do MMM, yyyy")}.{' '}
          <span onClick={onRefresh} className="cursor-pointer underline hover:text-gray-800">
            刷新
          </span>
        </div>
      )}
    </div>
  )
}
