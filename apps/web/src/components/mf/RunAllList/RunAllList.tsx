import ScrollBar from '@/components/ScrollBar'
import Spin from '@/components/Spin'
import {
  ApproveStatus,
  RunAllItem,
  RunAllStatus,
  useRunAllList,
} from '@/hooks/mf/runall/useRunAllList'
import { Transition } from '@headlessui/react'
import { ExclamationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import ApproveIcon from '../../../icons/approve-icon.svg'
import DownloadIocn from '../../../icons/download-icon.svg'
import { NoData } from '../NoData'
import styles from './index.module.scss'
import { StatusItem, StatusList, useQueryStatus } from '@/hooks/mf/runall/useQueryStatus'
import { NEXT_PUBLIC_MF_API_URL } from '@/utils/env'
import { useApprove } from '@/hooks/mf/runall/useApprove'
export interface IProps {
  workspaceId: string
  documnetId: string
  visible: boolean
  onHide: () => void
}

export default function RunAllList(props: IProps) {
  const observer = useRef<IntersectionObserver | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false) // 用于控制分页加载动画
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [statusIds, setStatusIds] = useState<number[]>([])
  const eventTimeoutId = useRef(-1)
  const [list, setList] = useState<RunAllItem[]>([])
  const updateListItem = useCallback(
    (item: StatusItem) => {
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
    },
    [list]
  )
  const updateStatusItem = useCallback(
    (res: StatusList) => {
      const continueIds: number[] = []
      for (const key in res.list) {
        const item = res.list[key]
        if (
          item.runStatus === RunAllStatus.Running ||
          item.runStatus === RunAllStatus.CodePushing ||
          (item.runStatus === RunAllStatus.RunSuccess &&
            item.approveStatus === ApproveStatus.InReview)
        ) {
          continueIds.push(item.id)
        }
        updateListItem(item)
      }
      setStatusIds(continueIds)
    },
    [statusIds, list]
  )
  useEffect(() => {
    if (!props.visible) {
      window.clearTimeout(eventTimeoutId.current)
      return
    }
    if (statusIds && statusIds.length > 0) {
      window.clearTimeout(eventTimeoutId.current)
      eventTimeoutId.current = window.setTimeout(() => {
        getStatusList(statusIds)
          .then((res) => {
            updateStatusItem(res)
          })
          .finally(() => {
            window.clearTimeout(eventTimeoutId.current)
            eventTimeoutId.current = window.setTimeout(() => {
              checkRunning([])
            }, 3000)
          })
      }, 3000)
    } else {
      window.clearTimeout(eventTimeoutId.current)
    }
  }, [statusIds])
  const checkRunning = useCallback(
    (list: RunAllItem[]) => {
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
      setStatusIds((prevList) => [...prevList, ...ids])
    },
    [statusIds]
  )
  const getRunAllList = useRunAllList()
  const getStatusList = useQueryStatus()
  const requestApprove = useApprove()
  useEffect(() => {
    if (props.visible) {
      setStatusIds([])
      getRunAllList(1, 100, props.documnetId)
        .then((res) => {
          setList(res.list)
          checkRunning(res.list)
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [props.visible])
  const loadMoreData = useCallback(() => {
    if (loading || isLoadingMore || !hasMore) {
      return
    }
    setIsLoadingMore(true)
    getRunAllList(currentPage + 1, 100, props.documnetId)
      .then((res) => {
        if (res.list.length > 0) {
          setList((prevList) => [...prevList, ...res.list])
          setCurrentPage((prevPage) => prevPage + 1)
          checkRunning(res.list)
        } else {
          setHasMore(false)
        }
      })
      .finally(() => {
        setIsLoadingMore(false)
      })
  }, [hasMore, loading, currentPage, props.documnetId])
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
                checkRunning([item])
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
        {list.length ? (
          <ScrollBar className={styles.listWrapper}>
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
              <div ref={listEndRef} className={styles.bottomLayout}>
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
