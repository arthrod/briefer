import Ansi from '@cocalc/ansi-to-react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import PageButtons from '@/components/PageButtons'
import Spin from '@/components/Spin'
import { useCSV } from '@/hooks/useQueryCSV'
import {
  PythonErrorRunQueryResult,
  RunQueryResult,
  SuccessRunQueryResult,
  SyntaxErrorRunQueryResult,
} from '@briefer/types'
import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Table from './Table'
import { fromPairs, splitEvery } from 'ramda'
import useResettableState from '@/hooks/useResettableState'
import LargeSpinner from '@/components/LargeSpinner'
import { ChevronDownIcon, ChevronRightIcon, SparklesIcon } from '@heroicons/react/20/solid'
import { ArrowDownTrayIcon } from '@heroicons/react/24/solid'
import { Tooltip } from '@/components/Tooltips'
import { NEXT_PUBLIC_API_URL } from '@/utils/env'

interface Props {
  blockId: string
  documentId: string
  workspaceId: string
  result: RunQueryResult
  dataframeName: string
  isPublic: boolean
  isResultHidden: boolean
  toggleResultHidden: () => void
  isFixingWithAI: boolean
  onFixWithAI: () => void
  dashboardMode: 'live' | 'editing' | 'none'
  canFixWithAI: boolean
}
function SQLResult(props: Props) {
  switch (props.result.type) {
    case 'success':
      return (
        <SQLSuccess
          result={props.result}
          isPublic={props.isPublic}
          documentId={props.documentId}
          workspaceId={props.workspaceId}
          dataframeName={props.dataframeName}
          isResultHidden={props.isResultHidden}
          toggleResultHidden={props.toggleResultHidden}
          blockId={props.blockId}
          dashboardMode={props.dashboardMode}
        />
      )
    case 'abort-error':
      return <SQLAborted />
    case 'syntax-error':
      return (
        <SQLSyntaxError
          result={props.result}
          isFixingWithAI={props.isFixingWithAI}
          onFixWithAI={props.onFixWithAI}
          canFixWithAI={props.canFixWithAI}
        />
      )
    case 'python-error':
      return <SQLPythonError result={props.result} />
  }
}

interface SQLSuccessProps {
  blockId: string
  documentId: string
  workspaceId: string
  result: SuccessRunQueryResult
  isPublic: boolean
  dataframeName: string
  isResultHidden: boolean
  toggleResultHidden: () => void
  dashboardMode: 'live' | 'editing' | 'none'
}
function SQLSuccess(props: SQLSuccessProps) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const rowsPerPage = 50
  const totalPages = Math.ceil(props.result.count / rowsPerPage)
  const [pages, setPages] = useResettableState(
    fromPairs(
      splitEvery(rowsPerPage, props.result.rows).map((rows, i) => [i, { rows, status: 'success' }])
    ),
    [rowsPerPage, props.result.rows]
  )

  const currentRows = useMemo(() => {
    if (pages[currentPageIndex] && pages[currentPageIndex].status === 'success') {
      return pages[currentPageIndex].rows
    }

    let prevPage = currentPageIndex - 1
    while (prevPage >= 0 && !pages[prevPage]) {
      prevPage--
    }

    return pages[prevPage]?.rows ?? []
  }, [currentPageIndex, props.result.rows, rowsPerPage, pages])

  useEffect(() => {
    if (pages[currentPageIndex]) {
      return
    }

    setPages((p) => ({
      ...p,
      [currentPageIndex]: { rows: [], status: 'loading' },
    }))
  }, [currentPageIndex, pages, setPages])

  useEffect(() => {
    if (!pages[currentPageIndex] || pages[currentPageIndex].status !== 'loading') {
      return
    }

    fetch(
      `${NEXT_PUBLIC_API_URL()}/v1/workspaces/${props.workspaceId}/documents/${
        props.documentId
      }/queries/${props.blockId}?page=${currentPageIndex}&pageSize=${rowsPerPage}&dataframeName=${
        props.dataframeName
      }`,
      {
        credentials: 'include',
      }
    )
      .then(async (res) => {
        if (res.status === 404) {
          setPages((p) => ({
            ...p,
            [currentPageIndex]: {
              ...(p[currentPageIndex] ?? { rows: [] }),
              status: 'not-found',
            },
          }))
          return
        }

        if (res.status !== 200) {
          setPages((p) => ({
            ...p,
            [currentPageIndex]: {
              ...(p[currentPageIndex] ?? { rows: [] }),
              status: 'unknown-error',
            },
          }))
          return
        }

        const parsedBody = RunQueryResult.safeParse(await res.json())
        if (!parsedBody.success) {
          setPages((p) => ({
            ...p,
            [currentPageIndex]: {
              ...(p[currentPageIndex] ?? { rows: [] }),
              status: 'unknown-error',
            },
          }))
          return
        }

        const data = parsedBody.data
        if (data.type !== 'success') {
          setPages((p) => ({
            ...p,
            [currentPageIndex]: {
              ...(p[currentPageIndex] ?? { rows: [] }),
              status: 'unknown-error',
            },
          }))
          return
        }

        setPages((p) => ({
          ...p,
          [currentPageIndex]: {
            rows: data.rows,
            status: 'success',
          },
        }))
      })
      .catch(() => {
        setPages((p) => ({
          ...p,
          [currentPageIndex]: {
            ...(p[currentPageIndex] ?? { rows: [] }),
            status: 'unknown-error',
          },
        }))
      })
  }, [
    pages,
    currentPageIndex,
    props.blockId,
    props.dataframeName,
    props.documentId,
    props.workspaceId,
    rowsPerPage,
  ])

  const prevPage = useCallback(() => {
    setCurrentPageIndex((prev) => Math.max(0, prev - 1))
  }, [setCurrentPageIndex])
  const nextPage = useCallback(() => {
    setCurrentPageIndex((prev) => {
      if (prev + 1 > totalPages) {
        return 0
      }

      return prev + 1
    })
  }, [setCurrentPageIndex, totalPages])
  const setPage = useCallback(
    (page: number) => {
      setCurrentPageIndex(Math.max(0, Math.min(page, Math.ceil(totalPages) - 1)))
    },
    [setCurrentPageIndex, totalPages]
  )

  const [csvRes, getCSV] = useCSV(props.workspaceId, props.documentId)
  const onDownloadCSV = useCallback(() => {
    getCSV(props.blockId, props.dataframeName)
  }, [getCSV, props.blockId, props.dataframeName])

  useEffect(() => {
    if (csvRes.loading) {
      return
    }

    if (csvRes.data) {
      const url = URL.createObjectURL(csvRes.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${props.dataframeName}.csv`
      a.click()
      setTimeout(() => {
        URL.revokeObjectURL(url)
        a.remove()
      }, 1000)
    }

    if (csvRes.error) {
      alert('Something went wrong')
    }
  }, [csvRes, props.dataframeName])

  const onRetryPage = useCallback(() => {
    setPages((p) => ({
      ...p,
      [currentPageIndex]: { rows: [], status: 'loading' },
    }))
  }, [currentPageIndex])

  const currentPage = pages[currentPageIndex]

  return (
    <div className="relative h-full w-full">
      {currentPage?.status === 'loading' ? (
        <div className="absolute bottom-8 left-0 right-0 top-0 z-10 flex items-center justify-center bg-white opacity-50">
          <LargeSpinner color="#deff80" />
        </div>
      ) : currentPage?.status === 'not-found' ? (
        <div className="absolute bottom-8 left-1 right-0 top-1 z-10 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center justify-center space-y-2">
            <ExclamationTriangleIcon className="h-12 w-12 text-gray-300" />
            <span className="text-lg text-gray-300">Dataframe not found, run the query again.</span>
          </div>
        </div>
      ) : currentPage?.status === 'unknown-error' ? (
        <div className="absolute bottom-8 left-1 right-0 top-1 z-10 flex items-center justify-center bg-white">
          <div className="flex flex-col items-center justify-center space-y-2">
            <ExclamationTriangleIcon className="h-12 w-12 text-gray-300" />
            <span className="text-lg text-gray-300">Something went wrong.</span>
            <button className="text-gray-300 hover:underline" onClick={onRetryPage}>
              Click here to retry.
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={clsx(
          props.dashboardMode !== 'none'
            ? 'h-[calc(100%-2rem)]'
            : 'h-full border-t border-gray-100',
          'ph-no-capture max-w-full rounded-b-md bg-white font-sans'
        )}>
        {props.dashboardMode === 'none' && (
          <div className="flex items-center justify-between gap-x-0.5 px-3 py-1.5 text-xs text-gray-300">
            <div className="flex">
              <button
                className="h-4 w-4 rounded-sm hover:text-gray-400 print:hidden"
                onClick={props.toggleResultHidden}>
                {props.isResultHidden ? <ChevronRightIcon /> : <ChevronDownIcon />}
              </button>
              <span className="pl-1.5 print:hidden">
                {props.isResultHidden ? 'Results collapsed' : 'Query results'}
              </span>
            </div>

            <span>
              {props.result.count} {props.result.count === 1 ? 'row' : 'rows'}
            </span>
          </div>
        )}
        {props.isResultHidden && props.dashboardMode === 'none' ? null : (
          <Table
            rows={currentRows}
            columns={props.result.columns}
            isDashboard={props.dashboardMode !== 'none'}
          />
        )}
      </div>

      {props.isResultHidden && props.dashboardMode === 'none' ? null : (
        <div className="font-syne flex w-full items-center justify-between rounded-b-md border-t border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
          <div className="text-gray-400">
            <PageButtons
              currentPage={currentPageIndex}
              totalPages={totalPages}
              prevPage={prevPage}
              nextPage={nextPage}
              setPage={setPage}
              loading={false}
              isPublic={props.isPublic}
            />
          </div>
          <div
            className={clsx(
              'group/csv-btn relative print:hidden',
              props.isPublic ? 'hidden' : 'block'
            )}>
            <button
              disabled={csvRes.loading}
              className={clsx(
                csvRes.loading
                  ? 'bg-gray-100'
                  : 'bg-primary-100 hover:bg-primary-200 border-primary-300 border',
                'text-primary-600 flex items-center gap-x-1 rounded-sm px-1 py-0.5'
              )}
              onClick={onDownloadCSV}>
              {csvRes.loading ? <Spin /> : <ArrowDownTrayIcon className="h-3 w-3" />}
            </button>
            {props.dashboardMode !== 'editing' && (
              <div
                className={clsx(
                  'bg-hunter-950 pointer-events-none absolute -top-1 flex w-max -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover/csv-btn:opacity-100',
                  props.dashboardMode === 'live' ? 'right-0' : 'left-1/2 -translate-x-1/2'
                )}>
                <span>Download as CSV</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SQLAborted() {
  return (
    <div className="border-t p-4 text-xs">
      <div className="flex items-center gap-x-3 border border-red-300 p-2">
        <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
        <div>
          <h4 className="font-semibold">Query aborted.</h4>
        </div>
      </div>
    </div>
  )
}

function SQLSyntaxError(props: {
  result: SyntaxErrorRunQueryResult
  isFixingWithAI: boolean
  onFixWithAI?: () => void
  canFixWithAI: boolean
}) {
  return (
    <div className="border-t p-4 text-xs">
      <div className="word-wrap flex gap-x-3 border border-red-300 p-4">
        <div className="w-full">
          <span className="flex items-center gap-x-2 pb-2">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
            <h4 className="mb-2 font-semibold">Your query could not be executed</h4>
          </span>
          <p>We received the following error:</p>
          <pre className="ph-no-capture overflow-hidden whitespace-pre-wrap">
            {props.result.message}
          </pre>
          {props.onFixWithAI && (
            <Tooltip
              title="Missing OpenAI API key"
              message="Admins can add an OpenAI key in settings."
              className="inline-block"
              tooltipClassname="w-40 text-center"
              position="top"
              active={!props.canFixWithAI}>
              <button
                disabled={!props.canFixWithAI}
                onClick={props.onFixWithAI}
                className="font-syne mt-2 flex items-center gap-x-2 rounded-sm border border-gray-200 px-2 py-1 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:border-0 disabled:bg-gray-200">
                {props.isFixingWithAI ? (
                  <>
                    <Spin />
                    修复中 - 点击取消
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-3 w-3" />
                    AI 修复
                  </>
                )}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

function SQLPythonError(props: { result: PythonErrorRunQueryResult }) {
  return (
    <div className="border-t p-4 text-xs">
      <div className="word-wrap flex gap-x-3 overflow-hidden border border-red-300 p-4 text-xs">
        <div className="w-full">
          <span className="flex items-center gap-x-2 pb-2">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
            <h4 className="font-semibold">Your code could not be executed</h4>
          </span>
          <p>We received the following error:</p>
          <pre className="ph-no-capture whitespace-pre-wrap">
            {props.result.ename} - {props.result.evalue}
          </pre>
        </div>
      </div>
    </div>
  )
}

export default SQLResult
