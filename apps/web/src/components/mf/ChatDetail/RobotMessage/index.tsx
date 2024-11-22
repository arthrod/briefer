import { forwardRef, useCallback, useEffect, useState } from 'react'
import styles from './index.module.scss'
import { parseSSEStream } from '@/hooks/mf/chat/useSSEMessage'
import React from 'react'
import LinkSvg from '../../../../icons/link-icon.svg'
// 定义 SSE 块的类型
export interface IProps {
  content: string
  receiveMsgDone?: () => void
}

const RobotMessage = forwardRef((props: IProps, ref) => {
  // 用于存储块内容和类型
  const [blocks, setBlocks] = useState<{ type: string; content: string; jsonNumber?: number }[]>([])
  let state = { currentType: null, currentContent: [] }
  const [length, setLength] = useState<number>(0)
  let jsonNumber = 0
  const handleSSEMessage = useCallback((data: string) => {
    // 解析 SSE 流
    parseSSEStream(
      data,
      {
        onStart: (type) => {
          if (type === 'json') {
            jsonNumber++
          }
          setBlocks((prevBlocks) => [...prevBlocks, { type, content: '' }])
        },
        onContent: (content) => {
          // 更新最后一个块的内容
          let number = jsonNumber
          setBlocks((prevBlocks) => {
            const lastIndex = prevBlocks.length - 1
            const updatedBlocks = [...prevBlocks]
            if (lastIndex >= 0) {
              updatedBlocks[lastIndex].content += content // 追加内容
              updatedBlocks[lastIndex].jsonNumber = number
            }
            return updatedBlocks
          })
        },
        onEnd: () => {},
        onClose: () => {
          state = { currentType: null, currentContent: [] }
          if (props.receiveMsgDone) {
            props.receiveMsgDone()
          }
        },
      },
      state
    )
  }, [])
  const getTableDes = (jsonData: any) => {
    const tableNameCN = jsonData.tableNameCN
    const totalColumnsCount = jsonData.totalColumnsCount || 0
    const relatedColumnsNumber = (jsonData.relatedColumns || []).length
    let str = '数据表描述：'
    str += tableNameCN ? tableNameCN : ''
    str += tableNameCN ? '，' : ''
    str += '包含' + totalColumnsCount + '列'
    str += '，其中' + relatedColumnsNumber + '个为表示相关'
    return str
  }
  useEffect(() => {
    handleSSEMessage(props.content.substring(length))
    setLength(props.content.length)
  }, [props.content])
  // 渲染不同类型的块
  const renderBlock = (
    block: { type: string; content: string; jsonNumber?: number },
    index: number
  ) => {
    switch (block.type) {
      case 'content':
        return (
          <div key={index} className={styles.content}>
            {block.content}
          </div>
        )
      case 'title':
        return (
          <div key={index} className={styles.title}>
            {block.content}
          </div>
        )
      case 'json':
        try {
          const jsonData = JSON.parse(block.content)
          return (
            <div key={index} className={styles.json}>
              <div className={styles.jsonTitle}>
                <div className={styles.link}>
                  <a href={jsonData.link} target="_blank">
                    {jsonData.table_name}
                  </a>
                  <div className={styles.linkIcon}>
                    <LinkSvg></LinkSvg>
                  </div>
                </div>
                <div className={styles.tips}>{'查找结果' + block.jsonNumber}</div>
              </div>
              <div className={styles.tableDes}>{getTableDes(jsonData)}</div>
              <div className={styles.relatedColumns}>
                {'相关字段：' +
                  (jsonData.relatedColumns || [])
                    .map((column: { columnName: string; columnDesp: string }) =>
                      column.columnDesp
                        ? `${column.columnDesp} (${column.columnName})`
                        : column.columnName
                    )
                    .join('、')}
              </div>
            </div>
          )
        } catch (e) {}
      default:
        return <div key={index}>{block.content}</div>
    }
  }
  // { console.log(blocks) }
  return (
    <div className={styles.robotMessage}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  )
})

export default RobotMessage
