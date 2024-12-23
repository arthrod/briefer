import React, { useEffect, useRef, useState } from 'react'
import Steps from 'rc-steps'
import styles from './index.module.scss'
import { LoadingCircle } from '../../LoadingCircle'
import JobSuccessIcon from '@/icons/job-success.svg'
import StepSuccessIcon from '@/icons/step-success.svg'
import StepFailedIcon from '@/icons/step-failed.svg'
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
  isCollapsed?: boolean
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
      return <StepFailedIcon></StepFailedIcon>
  }
}
const getStepStatusIcon = (status: Status) => {
  switch (status) {
    case 'waiting':
    case 'running':
      return <LoadingCircle style={{ top: '-2px', left: '-2px' }} size="sm"></LoadingCircle>
    case 'success':
      return <StepSuccessIcon></StepSuccessIcon>
    case 'failed':
      return <StepFailedIcon></StepFailedIcon>
  }
}

const ModuleSteps: React.FC<{ modules: Module[]; className?: string }> = ({
  modules,
  className,
}) => {
  return (
    <div className={clsx(className, styles.moduleSteps)}>
      {modules.map((module, mIndex) => (
        <div key={`module` + mIndex} className={clsx(styles.moduleItem)}>
          <div className={clsx(styles.moduleIcon, styles[`module-${module.status}`])}>
            {getStepStatusIcon(module.status)}
          </div>
          <div className={styles.moduleContent}>
            <a
              className={styles.moduleTitle}
              href={`#${module.blockId ? module.blockId : module.tasks[0]?.blockId}`}>
              {module.title}
            </a>
            <div className={clsx(styles.tasks)}>
              {module.tasks.map((task, tIndex) => (
                <div key={`task` + tIndex} className={styles.taskItem}>
                  <div className={clsx(styles.taskIcon, styles[`task-${task.status}`])}>
                    {getStepStatusIcon(task.status)}
                  </div>
                  <a href={task.blockId ? `#${task.blockId}` : ''} className={styles.taskTitle}>
                    {`任务${tIndex + 1}: `}
                    {task.variable ? (
                      <span style={{ color: '#2F69FE' }}>{`@${task.variable}`}</span>
                    ) : null}
                    {task.title}
                  </a>
                </div>
              ))}
            </div>
          </div>
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
  const [renderJobs, setRenderJobs] = useState<Job[]>(jobs)

  useEffect(() => {
    const newJobs = [...jobs]
    renderJobs.forEach((job, index) => {
      newJobs[index].isCollapsed = !!job?.isCollapsed
    })
    setRenderJobs([...jobs])
  }, [jobs])

  const handleCollapsed = (index: number) => {
    const newJobs = [...renderJobs]
    const job = newJobs[index]
    job.isCollapsed = !job.isCollapsed
    setRenderJobs(newJobs)
  }

  useEffect(() => {
    setStepItems(() => {
      return renderJobs.map((job, jobIndex) => ({
        title: job.title,
        description: (
          <div>
            {job.description ? <div>{job.description}</div> : null}
            {job.modules && job.modules.length ? (
              <>
                <ModuleSteps
                  className={job.isCollapsed ? styles.isCollapsed : ''}
                  modules={job.modules}></ModuleSteps>
                <div
                  className={styles.collapse}
                  onClick={() => {
                    handleCollapsed(jobIndex)
                  }}>
                  {job.isCollapsed ? '展开详情' : '折叠详情'}
                  <i className={clsx(styles.collapseIcon, job.isCollapsed ? styles.rotated : null)}>
                    <DoubleArrowIcon />
                  </i>
                </div>
              </>
            ) : null}
          </div>
        ),
        icon: (
          <i className={clsx(styles.jobIcon, styles[job.status])}>{getJobStatusIcon(job.status)}</i>
        ),
      }))
    })
  }, [renderJobs])

  return (
    <div className={styles.detailSteps}>
      <Steps current={jobs.length - 1} direction="vertical" items={stepItems} />
    </div>
  )
}

export default ReportStep
