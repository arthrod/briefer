import React from 'react'
import Steps from 'rc-steps'
import 'rc-steps/assets/index.css'
import styles from './index.module.scss'

interface Props {}

const ReportStep: React.FC<Props> = ({}) => {
  return (
    <div className={styles.detailSteps}>
      <Steps
        direction="vertical"
        items={[
          {
            title: '报告模板解析',
            description: '解析出30个文档模块',
          },
          {
            title: <div>文档模块处理</div>,
            description: '共40个数据查询/可视化任务，其中35个成功生成代码',
          },
          {
            title: '报告研发完成',
            description: '',
          },
        ]}
      />
    </div>
  )
}

export default ReportStep
