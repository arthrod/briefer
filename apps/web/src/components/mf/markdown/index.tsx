import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { a11yDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import LinkSvg from '@/icons/link-icon.svg'

import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you
import styles from './index.module.scss'
import clsx from 'clsx'

export default function Markdown(props: {
  children: string
  hiddenCodeCopyButton?: boolean
  className?: string
}) {
  const { children, hiddenCodeCopyButton, className } = props
  return useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        className={`markdown-body break-words ${className || ''}`}
        // urlTransform={(url) => sanitizeUrl(url)}
        components={{
          code: (props: any) => CodeBlock({ ...props, hiddenCodeCopyButton }),
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.stopPropagation()
              }}
            />
          ),
        }}>
        {children}
      </ReactMarkdown>
    ),
    [children]
  )
}

const customCode = ['content', 'title', 'json']

const getTableDes = (jsonData: any) => {
  const { tableNameCN, totalColumnsCount = 0, relatedColumns = [] } = jsonData
  return `数据表描述：${tableNameCN ? tableNameCN + '，' : ''}包含${totalColumnsCount}列，其中${relatedColumns.length}个为表示相关`
}

export function CodeBlock(props: any) {
  const renderBlock = (block: { type: string; content: string }) => {
    switch (block.type) {
      case 'title':
        return <div className={styles.title}>{block.content}</div>
      case 'content':
        return <div className={clsx(styles.content, 'text-sm')}>{block.content}</div>
      case 'json':
        try {
          const jsonData = JSON.parse(block.content)
          return (
            <div className={clsx(styles.json, 'text-sm')}>
              <div className={styles.jsonTitle}>
                <div className={styles.link}>
                  <a href={jsonData.link} target="_blank">
                    {jsonData.table_name}
                  </a>
                  <span>
                    <LinkSvg></LinkSvg>
                  </span>
                </div>
                {/* <div className={styles.tips}>{'查找结果' + block.jsonNumber}</div> */}
              </div>
              <div className={styles.tableDes}>{getTableDes(jsonData)}</div>
              <div className={styles.relatedColumns}>
                {'相关字段：' +
                  (jsonData.relatedColumns || [])
                    .map(
                      ({ columnName, columnDesp }: { columnName: string; columnDesp: string }) =>
                        columnDesp ? `${columnDesp} (${columnName})` : columnName
                    )
                    .join('、')}
              </div>
            </div>
          )
        } catch (e) {}
      default:
        return <div>{block.content}</div>
    }
  }
  return useMemo(() => {
    const { children, className, node, hiddenCodeCopyButton, ...rest } = props
    const match = /language-(\w+)/.exec(className || '')

    const language = match?.[1] || 'text'
    if (!String(children).includes('\n')) {
      return (
        <code
          {...rest}
          className={className}
          style={{
            backgroundColor: '#f1f1f1',
            padding: '2px 4px',
            marigin: '0 4px',
            borderRadius: '4px',
            border: '1px solid',
            borderColor: '#ddd',
          }}>
          {children}
        </code>
      )
    }
    if (customCode.includes(language)) {
      return renderBlock({ type: language, content: children })
    }
    return (
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            backgroundColor: 'rgb(50, 50, 50)',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            borderTopLeftRadius: '0.3rem',
            borderTopRightRadius: '0.3rem',
            borderBottomLeftRadius: '0',
            borderBottomRightRadius: '0',
          }}>
          <span
            style={{
              textDecoration: 'none',
              color: 'gray',
              padding: '2px',
              margin: '2px 10px 0 10px',
            }}>
            {'<' + language.toUpperCase() + '>'}
          </span>
        </div>
        <SyntaxHighlighter
          children={String(children).replace(/\n$/, '')}
          style={a11yDark}
          language={language}
          PreTag="div"
          customStyle={{
            marginTop: '0',
            margin: '0',
            borderTopLeftRadius: '0',
            borderTopRightRadius: '0',
            borderBottomLeftRadius: '0.3rem',
            borderBottomRightRadius: '0.3rem',
            border: 'none',
          }}
        />
      </div>
    )
  }, [props.children])
}
