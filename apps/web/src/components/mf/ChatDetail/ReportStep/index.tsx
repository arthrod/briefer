import React from 'react'
import Steps from 'rc-steps'
import styles from './index.module.scss'
import { LoadingCircle } from '../../LoadingCircle'
import StepSuccessIcon from '@/icons/step-success.svg'
import clsx from 'clsx'

interface Props {}

const ReportStep: React.FC<Props> = ({}) => {
  
  return (
    <div className={styles.detailSteps}>
      <Steps
        current={1}
        direction="vertical"
        items={[
          {
            title: '报告模板解析',
            description: '解析出30个文档模块',
            icon: (
              <i className={clsx(styles.icon, styles['success'])}>
                <StepSuccessIcon />
              </i>
            ),
          },
          {
            title: (
              <div className={styles.titleBox}>
                <div>文档模块处理</div>
                <div>收起/展开</div>
              </div>
            ),
            description: '共40个数据查询/可视化任务，其中35个成功生成代码',
            icon: (
              <i className={clsx(styles.icon, styles['waiting'])}>
                <LoadingCircle size="sm" />
              </i>
            ),
          },
          // {
          //   title: '报告研发完成',
          //   description: '',
          // },
        ]}
      />
    </div>
  )
}

export default ReportStep
