import ScrollBar from '@/components/ScrollBar'
import Spin from '@/components/Spin'
import { useApprove } from '@/hooks/mf/runall/useApprove'
import { StatusItem, StatusList, useQueryStatus } from '@/hooks/mf/runall/useQueryStatus'
import {
  ApproveStatus,
  RunAllItem,
  RunAllStatus,
  useRunAllList,
} from '@/hooks/mf/runall/useRunAllList'
import { getQueryParam } from '@/hooks/useQueryArgs'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { Transition } from '@headlessui/react'
import { ExclamationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import ApproveIcon from '../../../icons/approve-icon.svg'
import DownloadIocn from '../../../icons/download-icon.svg'
import { NoData } from '../NoData'
import styles from './index.module.scss'
import { Input } from '../Input'
import { getRunAll } from '@briefer/editor'
export interface IProps {
  workspaceId: string
  documnetId: string
  visible: boolean
  onHide: () => void
}

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: ReturnType<typeof setTimeout> | null
  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  } as T
}

export default function RunAllList(props: IProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isLoadingMore, setIsLoadingMore] = useState(false) // 用于控制分页加载动画
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [statusIds, setStatusIds] = useState<Set<number>>(new Set())
  const eventTimeoutId = useRef(-1)
  const [list, setList] = useState<RunAllItem[]>([])
  const handleScroll = debounce((e: Event) => {
    const div = e.target as HTMLDivElement
    const { scrollTop, scrollHeight, clientHeight } = div

    if (Math.abs(scrollHeight - scrollTop - clientHeight) <= 1) {
      loadMoreData()
    }
  }, 50)
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const debouncedScroll = debounce(handleScroll, 300)
      container.addEventListener('scroll', debouncedScroll)

      return () => {
        container.removeEventListener('scroll', debouncedScroll)
      }
    }
  }, [handleScroll])
  useEffect(() => {
    if (!loading && props.visible && scrollContainerRef.current && !isLoadingMore && hasMore) {
      const container = scrollContainerRef.current
      if (container.scrollHeight <= container.clientHeight) {
        loadMoreData()
      }
    }
  }, [list])
  const updateListItem = (item: StatusItem) => {
    setList((prevItems) =>
      prevItems.map((origin) =>
        origin.id === item.id
          ? {
              ...origin,
              runStatus: item.runStatus,
              approveStatus: item.approveStatus,
              endTime: item.endTime || origin.endTime, // 如果 item.endTime 存在，则更新，否则保留原值
              duration: item.duration,
              reason: item.failReson || origin.reason, // 如果 failReson 存在，则更新，否则保留原值
            }
          : origin
      )
    )
  }
  const updateStatusItem = (res: StatusList) => {
    const removeIds: number[] = []
    for (const key in res.list) {
      const item = res.list[key]
      updateListItem(item)
      if (
        item.runStatus !== RunAllStatus.Running &&
        item.runStatus !== RunAllStatus.CodePushing &&
        !(
          item.runStatus === RunAllStatus.RunSuccess &&
          item.approveStatus === ApproveStatus.InReview
        )
      ) {
        removeIds.push(item.id)
      }
      setStatusIds((prevStatusIds) => {
        // 从 prevStatusIds 中移除 removeIds
        const updatedStatusIds = new Set(
          Array.from(prevStatusIds).filter((id) => !removeIds.includes(id))
        )
        return updatedStatusIds
      })
    }
  }
  useEffect(() => {
    if (!props.visible || statusIds.size === 0) {
      return
    }
    checkStatus(Array.from(statusIds))
  }, [props.visible, statusIds])

  const checkStatus = (ids: number[]) => {
    window.clearTimeout(eventTimeoutId.current)
    eventTimeoutId.current = window.setTimeout(() => {
      getStatusList(ids).then((res) => {
        updateStatusItem(res)
      })
    }, 5000)
  }

  const addRunning = useCallback((list: RunAllItem[]) => {
    const ids: number[] = []
    for (const key in list) {
      const item = list[key]
      if (
        item.runStatus === RunAllStatus.Running ||
        item.runStatus === RunAllStatus.CodePushing ||
        (item.runStatus === RunAllStatus.RunSuccess &&
          item.approveStatus === ApproveStatus.InReview)
      ) {
        ids.push(item.id)
      }
    }
    if (ids.length > 0) {
      setStatusIds((prevSet) => {
        const newSet = new Set(prevSet) // 创建一个新的 Set，保留之前的值
        ids.forEach((id) => newSet.add(id)) // 将新 id 插入到 Set 中
        return newSet // 返回更新后的 Set
      })
    }
  }, [])

  const getRunAllList = useRunAllList()
  const getStatusList = useQueryStatus()
  const requestApprove = useApprove()
  const chatId = getQueryParam('chatId')
  useEffect(() => {
    window.clearTimeout(eventTimeoutId.current)
    setCurrentPage(1)
    setLoading(true)
    setSearch('')
    setIsLoadingMore(false)
    setStatusIds(new Set())
    setList([])
    if (props.visible) {
      getRunAllList(1, 100, chatId)
        .then((res) => {
          setList(res.list)
          setHasMore(res.list.length > 0)
          addRunning(res.list)
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [props.visible])
  const loadMoreData = () => {
    if (loading || isLoadingMore || !hasMore) {
      return
    }
    setIsLoadingMore(true)
    getRunAllList(currentPage + 1, 100, chatId, search)
      .then((res) => {
        if (res.list.length > 0) {
          setList((prevList) => [...prevList, ...res.list])
          setCurrentPage((prevPage) => prevPage + 1)
          addRunning(res.list)
          setHasMore(res.list.length > 0)
        } else {
          setHasMore(false)
        }
      })
      .finally(() => {
        setIsLoadingMore(false)
      })
  }
  const getRunStatus = (item: RunAllItem) => {
    switch (item.runStatus) {
      case RunAllStatus.Running:
        return (
          <div className={clsx(styles.runningLayout)}>
            <Spin
              color="#8792A4"
              className={styles.loading}
              wrapperClassName={styles.loadingWrapper}
            />
            <div>全量运行中</div>
          </div>
        )
      case RunAllStatus.RunSuccess:
        return (
          <div className={styles.successLayout}>
            <CheckCircle2Icon color="#00A85F" width={16} height={16} />
            <div>运行成功</div>
          </div>
        )
      case RunAllStatus.RunFailed:
      case RunAllStatus.NotRunning:
        return (
          <div className={styles.errorLayout}>
            <XCircleIcon color="#FF3B52" width={16} height={16} />
            <div>运行失败</div>
          </div>
        )
      case RunAllStatus.CodePushing:
        return (
          <div className={clsx(styles.runningLayout)}>
            <Spin
              color="#8792A4"
              className={styles.loading}
              wrapperClassName={styles.loadingWrapper}
            />
            <div>正在进行程序打包</div>
          </div>
        )
      case RunAllStatus.PushCodeFailed:
        return (
          <div className={styles.errorLayout}>
            <XCircleIcon color="#FF3B52" width={16} height={16} />
            <div>程序打包失败</div>
          </div>
        )
        break
    }
  }
  const getApprove = (item: RunAllItem) => {
    switch (item.approveStatus) {
      case ApproveStatus.NoSubmit:
        return (
          <div
            className={styles.successLayout}
            onClick={() => {
              requestApprove(item.id).then(() => {
                setList((prevItems) =>
                  prevItems.map((origin) =>
                    origin.id === item.id
                      ? {
                          ...origin,
                          approveStatus: ApproveStatus.InReview,
                        }
                      : origin
                  )
                )
                item.approveStatus = ApproveStatus.InReview
                addRunning([item])
              })
            }}>
            <div>
              <ApproveIcon></ApproveIcon>
            </div>
            <div>申请下载</div>
          </div>
        )
      case ApproveStatus.ApproveSuccess:
        return (
          <div
            className={styles.successLayout}
            onClick={() => {
              const fileUrl = `${NEXT_PUBLIC_MF_API_URL()}/run-all/report/download?id=${item.id}` // 文件地址
              window.open(fileUrl, '_blank')
            }}>
            <div>
              <DownloadIocn></DownloadIocn>
            </div>
            <div>下载结果</div>
          </div>
        )
      case ApproveStatus.ApproveReject:
        return (
          <div className={styles.rejectLayout}>
            <div>
              <ExclamationCircleIcon width={16} height={16}></ExclamationCircleIcon>
            </div>
            <div>审批未通过</div>
          </div>
        )
      case ApproveStatus.InReview:
        return (
          <div className={styles.inReviewLayout}>
            <Spin
              color="#8792A4"
              className={styles.loading}
              wrapperClassName={styles.loadingWrapper}
            />
            <div>审批中</div>
          </div>
        )
    }
  }
  const handleSearch = useCallback(
    async (searchTerm: string) => {
      if (loading) {
        return
      }
      setCurrentPage(1)
      setLoading(true)
      setIsLoadingMore(false)
      setStatusIds(new Set())
      setList([])
      window.clearTimeout(eventTimeoutId.current)
      getRunAllList(1, 100, chatId, searchTerm)
        .then((res) => {
          setList(res.list)
          setHasMore(res.list.length > 0)
          addRunning(res.list)
        })
        .finally(() => {
          setLoading(false)
        })
    },
    [loading]
  )
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSearch(search)
      }
    },
    [search, handleSearch]
  )
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
      <div className={styles.runAllLayout}>
        {/* <button
        className="absolute left-0 top-7 z-10 flex h-6 w-6 -translate-x-1/2 transform items-center justify-center rounded-full border border-gray-300 bg-white text-gray-400 hover:bg-gray-100"
        onClick={props.onHide}>
        <ChevronDoubleRightIcon className="h-3 w-3" />
      </button> */}
        <div className={styles.runAllTitleLayout}>
          <div className={styles.title}>全量运行记录</div>
          <XMarkIcon
            onClick={() => {
              window.clearTimeout(eventTimeoutId.current)
              props.onHide()
            }}
            className={clsx('w-[16px], h-[16px]', styles.icon)}></XMarkIcon>
        </div>
        <div className={styles.searchLayout}>
          <Input
            placeholder="搜索全量运行记录"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {list.length ? (
          <ScrollBar
            className={styles.listWrapper}
            ref={scrollContainerRef}
            onScroll={handleScroll}>
            {list.map((item, index) => (
              <div className={clsx(styles.cell, index >= 1 ? styles.cellMargin : '')} key={index}>
                <div className={styles.title}>{item.name}</div>
                <div className={styles.time}>
                  <span>{item.startTime}</span>
                  {item.endTime ? <span>{'-' + item.endTime}</span> : null}
                </div>
                <div className={styles.statusLayout}>
                  <div className={styles.status}>{getRunStatus(item)}</div>
                  {item.runStatus === RunAllStatus.RunSuccess && (
                    <div className={styles.approve}>{getApprove(item)}</div>
                  )}
                </div>
              </div>
            ))}
            {
              <div className={styles.bottomLayout}>
                {hasMore && isLoadingMore && !loading ? (
                  <div className="loading">
                    <Spin color="#2F69FE" />
                  </div>
                ) : (
                  <></>
                )}
              </div>
            }
          </ScrollBar>
        ) : (
          <div className={styles.empty}>
            {loading ? <Spin color="#2F69FE" wrapperClassName="pl-2" /> : <NoData />}
          </div>
        )}
      </div>
    </Transition>
  )
}
