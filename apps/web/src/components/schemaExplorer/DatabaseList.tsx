import { APIDataSources } from '@/hooks/useDatasources'
import ExplorerTitle from './ExplorerTitle'
import { databaseImages } from '../DataSourcesList'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid'
import { isDataSourceStructureLoading } from '@briefer/types'
import { useMemo } from 'react'

interface Props {
  dataSources: APIDataSources
  onSelectDataSource: (dataSourceId: string) => void
}
export default function DatabaseList(props: Props) {
  const sortedDataSources = useMemo(() => {
    return props.dataSources.sort((a, b) => {
      return a.config.data.name.localeCompare(b.config.data.name)
    })
  }, [props.dataSources])

  return (
    <div className="flex h-full flex-col">
      <ExplorerTitle
        title="Schema explorer"
        description="Choose a data source to explore its schema."
        dataSource={null}
        onRetrySchema={() => {}}
        canRetrySchema={false}
      />
      <div className="mt-4 flex-grow overflow-y-auto border-t border-gray-200 font-sans text-sm font-medium text-gray-500">
        <ul className="h-full">
          {sortedDataSources.map((dataSource) => {
            return (
              <li
                key={dataSource.config.data.id}
                className="flex cursor-pointer items-center justify-between border-b border-gray-200 px-4 py-2 hover:bg-gray-50 xl:px-6"
                onClick={() => props.onSelectDataSource(dataSource.config.data.id)}>
                <div className="flex items-center gap-x-2.5 font-mono text-xs">
                  <img
                    src={databaseImages(dataSource.config.type)}
                    alt=""
                    className="h-4 w-4 text-red-600"
                  />
                  <h4>{dataSource.config.data.name}</h4>
                </div>
                <div className="flex items-center gap-x-1">
                  {isDataSourceStructureLoading(dataSource.structure) ? (
                    <span className="animate-pulse text-xs font-normal text-gray-400">
                      Refreshing...
                    </span>
                  ) : dataSource.structure.status === 'failed' ? (
                    <>
                      <ExclamationTriangleIcon className="h-3 w-3 text-yellow-400/70" />
                      <span className="text-xs font-normal text-gray-400">Schema not loaded</span>
                    </>
                  ) : null}
                  <ChevronRightIcon className="h-3 w-3 text-white" />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
