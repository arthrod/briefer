import React, { useEffect, useRef, useState } from 'react'
import Steps from 'rc-steps'
import styles from './index.module.scss'
import { LoadingCircle } from '../../LoadingCircle'
import JobSuccessIcon from '@/icons/job-success.svg'
import StepSuccessIcon from '@/icons/step-success.svg'
import DoubleArrowIcon from '@/icons/double-arrow.svg'
import clsx from 'clsx'
import { StepProps } from 'rc-steps/lib/Step'

type Status = 'waiting' | 'running' | 'success' | 'failed'
interface Task {
  title: string
  description: string
  status: Status
  variable: string
  blockId: string
}

interface Module {
  title: string
  description: string
  status: Status
  blockId: string
  tasks: Task[]
}

interface Job {
  title: string
  description: string
  status: Status
  modules: Module[]
}

interface StepContent {
  jobs: Job[]
}

export interface StepJsonType {
  type: 'step'
  content: StepContent
}
export interface TextJsonType {
  type: 'text'
  content: string
}
export type ContentJsonType = StepJsonType | TextJsonType

const getJobStatusIcon = (status: Status) => {
  switch (status) {
    case 'waiting':
    case 'running':
      return <LoadingCircle size="sm"></LoadingCircle>
    case 'success':
      return <JobSuccessIcon></JobSuccessIcon>
    case 'failed':
      return <StepSuccessIcon></StepSuccessIcon>
  }
}
const getStepStatusIcon = (status: Status) => {
  switch (status) {
    case 'waiting':
    case 'running':
      return <LoadingCircle size="sm"></LoadingCircle>
    case 'success':
      return <StepSuccessIcon></StepSuccessIcon>
    case 'failed':
      return <StepSuccessIcon></StepSuccessIcon>
  }
}
const ModuleSteps: React.FC<{ modules: Module[] }> = ({ modules }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const contentHeight = useRef<number>(0)

  useEffect(() => {
    if (isCollapsed) {
    } else {
      isCollapsed
    }
  }, [isCollapsed])

  return (
    <div className={styles.moduleSteps}>
      {modules.map((module) => (
        <div className={styles.moduleItem}>
          <div className={styles.moduleContent}>
            <div className={clsx(styles.moduleIcon, styles[`module-${module.status}`])}>
              {getStepStatusIcon(module.status)}
            </div>
            <div>
              <div className={styles.moduleTitle}>{module.title}</div>
              <div className={clsx(styles.tasks, isCollapsed && styles.isCollapsed)}>
                {module.tasks.map((task, tIndex) => (
                  <div className={styles.taskItem}>
                    <div className={clsx(styles.taskIcon, styles[`task-${task.status}`])}>
                      {getStepStatusIcon(task.status)}
                    </div>
                    <div className={styles.taskTitle}>
                      {`任务${tIndex + 1}: `}
                      {task.variable ? (
                        <span style={{ color: '#2F69FE' }}>{`@${task.variable}`}</span>
                      ) : null}
                      {task.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {module.tasks && module.tasks.length ? (
            <div className={styles.collapse} onClick={() => setIsCollapsed(!isCollapsed)}>
              {isCollapsed ? '展开详情' : '折叠详情'}
              <i className={clsx(styles.collapseIcon, isCollapsed ? styles.rotated : null)}>
                <DoubleArrowIcon />
              </i>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

interface Props {
  jobs: Job[]
}

const ReportStep: React.FC<Props> = ({ jobs }) => {
  const [stepItems, setStepItems] = useState<StepProps[]>([])
  useEffect(() => {
    setStepItems(() => {
      return jobs.map((job) => ({
        title: job.title,
        description: (
          <div>
            {job.description ? <div>{job.description}</div> : null}
            {job.modules ? <ModuleSteps modules={job.modules}></ModuleSteps> : null}
          </div>
        ),
        icon: (
          <i className={clsx(styles.jobIcon, styles[job.status])}>{getJobStatusIcon(job.status)}</i>
        ),
      }))
    })
  }, [jobs])
  return (
    <div className={styles.detailSteps}>
      <Steps current={jobs.length - 1} direction="vertical" items={stepItems} />
    </div>
  )
}

export default ReportStep
