import ScrollBar from '@/components/ScrollBar'
import Spin from '@/components/Spin'
import {
  ApproveStatus,
  RunAllItem,
  RunAllStatus,
  useRunAllList,
} from '@/hooks/mf/runall/useRunAllList'
import { Transition } from '@headlessui/react'
import {
  ExclamationCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import { NoData } from '../NoData'
import styles from './index.module.scss'
import DownloadIocn from '../../../icons/download-icon.svg'
import ApproveIcon from '../../../icons/approve-icon.svg'
import {
  CheckCircle,
  CheckCircle2,
  CheckCircle2Icon,
  CheckCircleIcon,
  XCircleIcon,
} from 'lucide-react'
export interface IProps {
  workspaceId: string
  documnetId: string
  visible: boolean
  onHide: () => void
}

export default function RunAll(props: IProps) {
  const [list, setList] = useState<RunAllItem[]>([
    {
      id: 'string',
      name: '能源统计月度分析报告20241020164408',
      documentId: 'string',
      jobId: 'string',
      runStatus: 1,
      approveStatus: 1,
      startTime: '2024/10/28 18:49:09',
      endTime: '2024/10/28 18:49:09',
      duration: 'string',
      des: 'string',
      version: 'string',
      reason: 'string',
    },
    {
      id: 'string',
      name: '能源统计月度分析报告20241020164408',
      documentId: 'string',
      jobId: 'string',
      runStatus: 2,
      approveStatus: 1,
      startTime: '2024/10/28 18:49:09',
      endTime: '2024/10/28 18:49:09',
      duration: 'string',
      des: 'string',
      version: 'string',
      reason: 'string',
    },
    {
      id: 'string',
      name: '能源统计月度分析报告20241020164408',
      documentId: 'string',
      jobId: 'string',
      runStatus: 3,
      approveStatus: 3,
      startTime: '2024/10/28 18:49:09',
      endTime: '2024/10/28 18:49:09',
      duration: 'string',
      des: 'string',
      version: 'string',
      reason: 'string',
    },
    {
      id: 'string',
      name: '能源统计月度分析报告20241020164408',
      documentId: 'string',
      jobId: 'string',
      runStatus: 2,
      approveStatus: 4,
      startTime: '2024/10/28 18:49:09',
      endTime: '2024/10/28 18:49:09',
      duration: 'string',
      des: 'string',
      version: 'string',
      reason: 'string',
    },
    {
      id: 'string',
      name: '能源统计月度分析报告20241020164408',
      documentId: 'string',
      jobId: 'string',
      runStatus: 2,
      approveStatus: 3,
      startTime: '2024/10/28 18:49:09',
      endTime: '2024/10/28 18:49:09',
      duration: 'string',
      des: 'string',
      version: 'string',
      reason: 'string',
    },
    {
      id: 'string',
      name: '能源统计月度分析报告20241020164408',
      documentId: 'string',
      jobId: 'string',
      runStatus: 2,
      approveStatus: 5,
      startTime: '2024/10/28 18:49:09',
      endTime: '2024/10/28 18:49:09',
      duration: 'string',
      des: 'string',
      version: 'string',
      reason: 'string',
    },
  ])
  const [loading, setLoading] = useState(true)
  const getRunAllList = useRunAllList()
  useEffect(() => {
    if (props.visible) {
      getRunAllList(1, 10000, props.documnetId)
        .then((res) => {
          setList(res.list)
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [props.visible])
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
        return (
          <div className={styles.errorLayout}>
            <XCircleIcon color="#FF3B52" width={16} height={16} />
            <div>运行失败</div>
          </div>
        )
      case RunAllStatus.NotRunning:
        break
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
          <div className={styles.successLayout}>
            <div>
              <ApproveIcon></ApproveIcon>
            </div>
            <div>申请下载</div>
          </div>
        )
      case ApproveStatus.ApproveSuccess:
        return (
          <div className={styles.successLayout}>
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
            onClick={props.onHide}
            className={clsx('w-[16px], h-[16px]', styles.icon)}></XMarkIcon>
        </div>
        {list.length ? (
          <ScrollBar className={styles.listWrapper}>
            {list.map((item, index) => {
              return (
                <div className={clsx(styles.cell, index >= 1 ? styles.cellMargin : '')} key={index}>
                  <div className={styles.title}>{item.name}</div>
                  <div className={styles.time}>
                    <span>{item.startTime}</span>
                    {item.endTime ? <span>{'-' + item.endTime}</span> : null}
                  </div>
                  {
                    <div className={styles.statusLayout}>
                      <div className={styles.status}>{getRunStatus(item)}</div>
                      {item.runStatus === RunAllStatus.RunSuccess ? (
                        <div className={styles.approve}>{getApprove(item)}</div>
                      ) : (
                        <></>
                      )}
                    </div>
                  }
                </div>
              )
            })}
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
