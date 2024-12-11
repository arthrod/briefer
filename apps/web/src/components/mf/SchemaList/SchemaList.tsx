import ScrollBar from '@/components/ScrollBar'
import Spin from '@/components/Spin'
import { TableItem, useSchemaList } from '@/hooks/mf/schema/useSchemaList'
import { Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import TableIcon from '../../../icons/table-icon.svg'
import { NoData } from '../NoData'
import styles from './index.module.scss'
import RowIcon from '../../../icons/row-icon.svg'
import ColumnIcon from '../../../icons/column-icon.svg'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/Dialog'
import { Input } from '../Input'
import { ColumnItem, useTableColumns } from '@/hooks/mf/schema/useTableColumns'

export interface IProps {
  workspaceId: string
  documnetId: string
  visible: boolean
  onHide: () => void
}

export default function SchemaList(props: IProps) {
  const observer = useRef<IntersectionObserver | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [list, setList] = useState<TableItem[]>([])

  const getSchemaList = useSchemaList()
  const [selectedItem, setSelectedItem] = useState<TableItem | null>(null)
  const [columns, setColumns] = useState<ColumnItem[]>([])
  const [loadingColumns, setLoadingColumns] = useState(false)
  const getTableColumns = useTableColumns()

  const handleSearch = useCallback(
    async (searchTerm: string) => {
      if (loading) {
        return
      }
      setLoading(true)
      setCurrentPage(1)
      try {
        const res = await getSchemaList(1, 100, searchTerm)
        setList(res.list)
        setHasMore(res.list.length === 100)
      } catch (error) {
        console.error('Failed to fetch schema list:', error)
      } finally {
        setLoading(false)
      }
    },
    [loading]
  )

  useEffect(() => {
    if (props.visible) {
      getSchemaList(1, 100)
        .then((res) => {
          setList(res.list)
          setHasMore(res.list.length === 100)
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [props.visible])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSearch(search)
      }
    },
    [search, handleSearch]
  )

  const loadMoreData = useCallback(() => {
    if (loading || isLoadingMore || !hasMore) {
      return
    }
    setIsLoadingMore(true)
    getSchemaList(currentPage + 1, 100, search)
      .then((res) => {
        if (res.list.length > 0) {
          setList((prevList) => [...prevList, ...res.list])
          setCurrentPage((prevPage) => prevPage + 1)
          setHasMore(res.list.length === 100)
        } else {
          setHasMore(false)
        }
      })
      .finally(() => {
        setIsLoadingMore(false)
      })
  }, [hasMore, loading, currentPage, search])

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMoreData()
        }
      },
      { root: null, rootMargin: '0px', threshold: 1.0 }
    )

    if (listEndRef.current) {
      observer.current.observe(listEndRef.current)
    }

    return () => {
      if (observer.current && listEndRef.current) {
        observer.current.unobserve(listEndRef.current)
      }
    }
  }, [listEndRef.current, loadMoreData, hasMore])

  const formatNum = (num: number) => {
    const thresholds = [
      { threshold: 10000, unit: 'W' },
      { threshold: 1000000, unit: 'M' },
    ]

    // 如果数字小于10000，直接返回原始数字
    if (num < thresholds[0].threshold) {
      return num.toString()
    }

    // 查找适用的阈值和单位
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (num >= thresholds[i].threshold) {
        let value = num / thresholds[i].threshold
        // 只在需要时保留小数点后的一位
        let realValue = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)
        return `${realValue}${thresholds[i].unit}+`
      }
    }
  }

  const handleDialogOpen = async (item: TableItem) => {
    setSelectedItem(item)
    setLoadingColumns(true)
    try {
      const res = await getTableColumns(item.id)
      setColumns(res.list)
    } catch (error) {
    } finally {
      setLoadingColumns(false)
    }
  }

  const handleDialogClose = () => {
    setSelectedItem(null)
    setColumns([])
  }

  useEffect(() => {
    if (!loading && props.visible && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      if (container.scrollHeight <= container.clientHeight && !isLoadingMore && list.length > 0) {
        setHasMore(true)
        loadMoreData()
      }
    }
  }, [loading, props.visible, list.length])

  return (
    <Transition
      as="div"
      show={props.visible}
      className="absolute right-0 top-0 z-30 h-full bg-white"
      enter="transition-transform duration-300"
      enterFrom="transform translate-x-full"
      enterTo="transform translate-x-0"
      leave="transition-transform duration-300"
      leaveFrom="transform translate-x-0"
      leaveTo="transform translate-x-full">
      <div className="h-full">
        <div className={styles.schemaLayout}>
          <div className={styles.schemaTitleLayout}>
            <div className={styles.title}>数据目录</div>
            <XMarkIcon onClick={props.onHide} className={clsx('w-[16px], h-[16px]', styles.icon)} />
          </div>
          <div className={styles.searchLayout}>
            <Input
              placeholder="搜索表"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
              }}
              onKeyDown={handleKeyDown}
            />
          </div>
          {list.length ? (
            <ScrollBar className={styles.listWrapper} ref={scrollContainerRef}>
              {list.map((item, index) => (
                <div
                  key={`table-${index}`}
                  className={clsx(styles.cell, styles.cellMargin)}
                  onClick={() => handleDialogOpen(item)}>
                  <div className={styles.title}>
                    <div key={`icon-${index}`}>
                      <TableIcon></TableIcon>
                    </div>
                    <div key={`content-${index}`} className={styles.content}>
                      {item.tableName}
                    </div>
                  </div>
                  <div key={`des-${index}`} className={styles.des}>
                    {item.des}
                  </div>
                  <div key={`stats-${index}`} className={styles.rowAndColLayout}>
                    <div key={`row-${index}`} className={styles.row}>
                      <RowIcon></RowIcon>
                      <div>{formatNum(item.rowNum)}</div>
                    </div>
                    <div key={`col-${index}`} className={styles.col}>
                      <ColumnIcon></ColumnIcon>
                      <div>{formatNum(item.colNum)}</div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={listEndRef} className={styles.bottomLayout}>
                {hasMore && isLoadingMore && !loading ? (
                  <div key="loading" className="loading">
                    <Spin color="#2F69FE" />
                  </div>
                ) : null}
              </div>
            </ScrollBar>
          ) : (
            <div key="empty" className={styles.empty}>
              {loading ? (
                <Spin color="#2F69FE" wrapperClassName="pl-2" />
              ) : search ? (
                <NoData text="未找到匹配的表" />
              ) : (
                <NoData />
              )}
            </div>
          )}

          <AlertDialog open={!!selectedItem} onOpenChange={(open) => !open && handleDialogClose()}>
            {selectedItem && (
              <AlertDialogContent
                className="max-w-[800px]"
                aria-describedby="alert-dialog-description">
                <AlertDialogTitle>{selectedItem.tableName}</AlertDialogTitle>
                <div id="alert-dialog-description" className="space-y-4">
                  <AlertDialogDescription asChild>
                    <div className="text-sm text-gray-500">{selectedItem.des}</div>
                  </AlertDialogDescription>
                  {loadingColumns ? (
                    <div className="flex justify-center py-4">
                      <Spin color="#2F69FE" />
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-auto">
                      <table className="w-full text-sm" role="grid">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-4 py-2 text-left">
                              字段名
                            </th>
                            <th scope="col" className="px-4 py-2 text-left">
                              类型
                            </th>
                            <th scope="col" className="px-4 py-2 text-left">
                              描述
                            </th>
                            <th scope="col" className="px-4 py-2 text-left">
                              主键
                            </th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-500">
                          {columns.map((column) => (
                            <tr key={`column-${column.id}`} className="border-b">
                              <td className="px-4 py-2">{column.name}</td>
                              <td className="px-4 py-2">{column.type}</td>
                              <td className="px-4 py-2">{column.comment}</td>
                              <td className="px-4 py-2">{column.isPrimary ? '是' : '否'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={handleDialogClose} className="focus:outline-none">
                    关闭
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            )}
          </AlertDialog>
        </div>
      </div>
    </Transition>
  )
}
