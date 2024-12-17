import {
  PlayIcon,
  StopIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  SparklesIcon,
  ChartBarIcon,
  BookOpenIcon,
} from '@heroicons/react/20/solid'
import { CopyToClipboard } from 'react-copy-to-clipboard'
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import {
  type SQLBlock,
  setTitle,
  getSQLBlockExecStatus,
  execStatusIsDisabled,
  getSQLSource,
  isSQLBlockAIEditing,
  toggleSQLEditWithAIPromptOpen,
  requestSQLEditWithAI,
  isSQLBlockEditWithAIPromptOpen,
  closeSQLEditWithAIPrompt,
  isFixingSQLWithAI,
  requestSQLFixWithAI,
  updateYText,
  YBlockGroup,
  YBlock,
  BlockType,
  addGroupedBlock,
  getSQLAttributes,
  createComponentState,
} from '@briefer/editor'
import SQLResult from './SQLResult'
import type { ApiDocument, ApiWorkspace, DataSourceType } from '@briefer/database'
import DataframeNameInput from './DataframeNameInput'
import HeaderSelect from '@/components/v2Editor/customBlocks/sql/HeaderSelect'
import clsx from 'clsx'
import { useEnvironmentStatus } from '@/hooks/useEnvironmentStatus'
import {
  LoadingEnvText,
  LoadingQueryText,
  QuerySucceededText,
} from '@/components/ExecutionStatusText'
import { ConnectDragPreview } from 'react-dnd'
import EditWithAIForm from '../../EditWithAIForm'
import ApproveDiffButons from '../../ApproveDiffButtons'
import { SQLExecTooltip } from '../../ExecTooltip'
import LargeSpinner from '@/components/LargeSpinner'
import { APIDataSources } from '@/hooks/useDatasources'
import { useRouter } from 'next/router'
import HiddenInPublishedButton from '../../HiddenInPublishedButton'
import useEditorAwareness from '@/hooks/useEditorAwareness'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import useProperties from '@/hooks/useProperties'
import { SaveReusableComponentButton } from '@/components/ReusableComponents'
import { useReusableComponents } from '@/hooks/useReusableComponents'
import { CodeEditor } from '../../CodeEditor'

const NO_DS_TEXT = `-- 未找到数据源`

interface Props {
  block: Y.XmlElement<SQLBlock>
  layout: Y.Array<YBlockGroup>
  blocks: Y.Map<YBlock>
  dataSources: APIDataSources
  document: ApiDocument
  isEditable: boolean
  isPublicMode: boolean
  dragPreview: ConnectDragPreview | null
  onRun: (block: Y.XmlElement<SQLBlock>) => void
  onTry: (block: Y.XmlElement<SQLBlock>) => void
  dashboardMode: 'live' | 'editing' | 'none'
  hasMultipleTabs: boolean
  isBlockHiddenInPublished: boolean
  onToggleIsBlockHiddenInPublished: (blockId: string) => void
  onSchemaExplorer: (dataSourceId: string | null) => void
  insertBelow: () => void
}

function SQLBlock(props: Props) {
  const properties = useProperties()
  const [workspaces] = useWorkspaces()
  const currentWorkspace: ApiWorkspace | undefined = useMemo(
    () => workspaces.data.find((w) => w.id === props.document.workspaceId),
    [workspaces.data, props.document.workspaceId]
  )

  const hasOaiKey = useMemo(() => {
    return true
    // !properties.data?.disableCustomOpenAiKey &&
    // (currentWorkspace?.secrets.hasOpenAiApiKey ?? false)
  }, [currentWorkspace, properties.data])

  const toggleResultHidden = useCallback(() => {
    props.block.doc?.transact(() => {
      const currentIsResultHidden = props.block.getAttribute('isResultHidden')
      props.block.setAttribute('isResultHidden', !currentIsResultHidden)
    })
  }, [props.block])

  const toggleCodeHidden = useCallback(() => {
    props.block.doc?.transact(() => {
      const currentIsCodeHidden = props.block.getAttribute('isCodeHidden')
      props.block.setAttribute('isCodeHidden', !currentIsCodeHidden)
    })
  }, [props.block])

  const onRun = useCallback(() => {
    props.onRun(props.block)
  }, [props.onRun, props.block])

  const onTry = useCallback(() => {
    props.onTry(props.block)
  }, [props.onTry, props.block])

  const status = props.block.getAttribute('status')

  const execStatus = getSQLBlockExecStatus(props.block)
  const statusIsDisabled = execStatusIsDisabled(execStatus)

  const onToggleEditWithAIPromptOpen = useCallback(() => {
    if (!hasOaiKey) {
      return
    }

    toggleSQLEditWithAIPromptOpen(props.block)
  }, [props.block, hasOaiKey])

  // useEffect(() => {
  //   const currentSrc = getSQLSource(props.block)
  //   if (!props.dataSources.size && currentSrc.length === 0) {
  //     updateYText(getSQLSource(props.block), NO_DS_TEXT)
  //   }
  // }, [props.dataSources, props.block])

  const {
    dataframeName,
    id: blockId,
    title,
    result,
    isCodeHidden,
    isResultHidden,
    editWithAIPrompt,
    aiSuggestions,
    dataSourceId,
    isFileDataSource,
    componentId,
  } = getSQLAttributes(props.block, props.blocks)

  const [
    { data: components },
    { create: createReusableComponent, update: updateReusableComponent },
  ] = useReusableComponents(props.document.workspaceId)
  const component = useMemo(
    () => components.find((c) => c.id === componentId),
    [components, componentId]
  )

  const [editorState, editorAPI] = useEditorAwareness()

  const onCloseEditWithAIPrompt = useCallback(() => {
    closeSQLEditWithAIPrompt(props.block, false)
    editorAPI.insert(blockId, { scrollIntoView: false })
  }, [props.block, editorAPI.insert])

  const onChangeDataSource = useCallback(
    (df: { value: string; type: DataSourceType | 'duckdb' }) => {
      if (df.type === 'duckdb') {
        props.block.setAttribute('dataSourceId', null)
        props.block.setAttribute('isFileDataSource', true)
      } else {
        props.block.setAttribute('dataSourceId', df.value)
        props.block.setAttribute('isFileDataSource', false)
      }
    },
    [props.block]
  )

  const { status: envStatus, loading: envLoading } = useEnvironmentStatus(
    props.document.workspaceId
  )

  const onChangeTitle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(props.block, e.target.value)
    },
    [props.block]
  )

  const onRunAbort = useCallback(() => {
    if (status === 'running') {
      props.block.setAttribute('status', 'abort-requested')
    } else {
      onRun()
    }
  }, [status, props.block, onRun])

  const { source } = getSQLAttributes(props.block, props.blocks)
  const lastQuery = props.block.getAttribute('lastQuery')
  const lastQueryTime = props.block.getAttribute('lastQueryTime')
  const queryStatusText = useMemo(() => {
    switch (execStatus) {
      case 'idle':
      case 'error':
      case 'success': {
        if (source?.toJSON() === lastQuery && lastQueryTime) {
          return <QuerySucceededText lastExecutionTime={lastQueryTime} />
        }

        return null
      }
      case 'enqueued':
      case 'loading':
        if (envStatus === 'Starting') {
          return <LoadingEnvText />
        } else {
          return <LoadingQueryText />
        }
    }
  }, [execStatus, lastQuery, lastQueryTime, source, envStatus])

  const onSubmitEditWithAI = useCallback(() => {
    requestSQLEditWithAI(props.block)
  }, [props.block])

  const onAcceptAISuggestion = useCallback(() => {
    if (aiSuggestions) {
      updateYText(source, aiSuggestions.toString())
    }

    props.block.setAttribute('aiSuggestions', null)
  }, [props.block, aiSuggestions, source])

  const onRejectAISuggestion = useCallback(() => {
    props.block.setAttribute('aiSuggestions', null)
  }, [props.block])

  const onFixWithAI = useCallback(() => {
    if (!hasOaiKey) {
      return
    }

    const status = props.block.getAttribute('status')
    if (status === 'fix-with-ai-running') {
      props.block.setAttribute('status', 'idle')
    } else {
      requestSQLFixWithAI(props.block)
    }
  }, [props.block, hasOaiKey])

  const isAIEditing = isSQLBlockAIEditing(props.block)

  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => {
        setCopied(false)
      }, 2000)
      return () => clearTimeout(timeout)
    }
  }, [copied, setCopied])

  const diffButtonsVisible =
    !props.isPublicMode &&
    aiSuggestions !== null &&
    (status === 'idle' || status === 'running-suggestion' || status === 'try-suggestion-requested')

  const router = useRouter()
  const onAddDataSource = useCallback(() => {
    router.push(`/workspaces/${props.document.workspaceId}/data-sources`)
  }, [router, props.document.workspaceId])

  const onToggleIsBlockHiddenInPublished = useCallback(() => {
    props.onToggleIsBlockHiddenInPublished(blockId)
  }, [props.onToggleIsBlockHiddenInPublished, blockId])

  const onSchemaExplorer = useCallback(() => {
    props.onSchemaExplorer(dataSourceId)
  }, [props.onSchemaExplorer, dataSourceId])

  const onClickWithin = useCallback(() => {
    editorAPI.focus(blockId, { scrollIntoView: false })
  }, [blockId, editorAPI.focus])

  const dataSourcesOptions = useMemo(
    () =>
      props.dataSources
        .map((d) => ({
          value: d.config.data.id,
          label: d.config.data.name,
          type: d.config.type,
          isDemo: d.config.data.isDemo,
        }))
        .toArray(),
    [props.dataSources]
  )

  const isComponentInstance = component !== undefined && component.blockId !== blockId

  const onSaveReusableComponent = useCallback(() => {
    const component = components.find((c) => c.id === componentId)
    if (!component) {
      const { id: componentId, state } = createComponentState(props.block, props.blocks)
      createReusableComponent(
        props.document.workspaceId,
        {
          id: componentId,
          blockId,
          documentId: props.document.id,
          state,
          title,
          type: 'sql',
        },
        props.document.title
      )
    } else if (!isComponentInstance) {
      // can only update component if it is not an instance
      updateReusableComponent(props.document.workspaceId, component.id, {
        state: createComponentState(props.block, props.blocks).state,
        title,
      })
    }
  }, [
    createReusableComponent,
    props.document.workspaceId,
    blockId,
    props.document.id,
    title,
    props.block,
    components,
    isComponentInstance,
    props.document.title,
  ])

  if (props.dashboardMode !== 'none') {
    if (!result) {
      return (
        <div className="flex h-full items-center justify-center">
          {status !== 'idle' ? (
            <LargeSpinner color="#b8f229" />
          ) : (
            <div className="text-gray-500">No query results</div>
          )}
        </div>
      )
    }

    return (
      <SQLResult
        result={result}
        isPublic={props.isPublicMode}
        documentId={props.document.id}
        workspaceId={props.document.workspaceId}
        blockId={blockId}
        dataframeName={dataframeName?.value ?? ''}
        isResultHidden={isResultHidden ?? false}
        toggleResultHidden={toggleResultHidden}
        isFixingWithAI={isFixingSQLWithAI(props.block)}
        onFixWithAI={onFixWithAI}
        dashboardMode={props.dashboardMode}
        canFixWithAI={hasOaiKey}
      />
    )
  }

  const headerSelectValue = isFileDataSource ? 'duckdb' : dataSourceId

  const isEditorFocused = editorState.cursorBlockId === blockId

  return (
    <div className="group/block relative" onClick={onClickWithin} data-block-id={blockId}>
      <div
        className={clsx(
          'rounded-md border',
          props.isBlockHiddenInPublished && 'border-dashed',
          props.hasMultipleTabs ? 'rounded-tl-none' : 'rounded-tl-md',
          {
            'border-ceramic-400 shadow-sm': isEditorFocused && editorState.mode === 'insert',
            'border-blue-400 shadow-sm': isEditorFocused && editorState.mode === 'normal',
            'border-gray-200': !isEditorFocused,
          }
        )}>
        <div
          className={clsx(
            'rounded-md',
            statusIsDisabled ? 'bg-gray-100' : 'bg-white',
            props.hasMultipleTabs ? 'rounded-tl-none' : ''
          )}>
          <div
            className="py-3"
            ref={(d) => {
              props.dragPreview?.(d)
            }}>
            <div className="flex h-[1.6rem] items-center justify-between gap-x-4 px-3 pr-3 font-sans">
              <div className="flex h-full w-full select-none items-center text-xs text-gray-300">
                <button
                  className="mr-0.5 h-4 w-4 rounded-sm hover:text-gray-400 print:hidden"
                  onClick={toggleCodeHidden}>
                  {isCodeHidden ? <ChevronRightIcon /> : <ChevronDownIcon />}
                </button>
                <input
                  type="text"
                  className={clsx(
                    'block h-full w-full rounded-md border-0 bg-transparent py-0 pl-1 font-sans text-xs text-gray-500 ring-inset ring-gray-200 placeholder:text-gray-400 hover:ring-1 focus:ring-1 focus:ring-inset focus:ring-gray-400 disabled:ring-0'
                  )}
                  placeholder="SQL"
                  value={title}
                  onChange={onChangeTitle}
                  disabled={!props.isEditable}
                />
              </div>
              <div
                className={clsx(
                  'flex h-full items-center gap-x-2 group-focus/block:opacity-100 print:hidden',
                  {
                    hidden: isCodeHidden,
                  }
                )}>
                <DataframeNameInput
                  disabled={!props.isEditable || statusIsDisabled}
                  block={props.block}
                />
                {/* <HeaderSelect
                  hidden={props.isPublicMode}
                  value={headerSelectValue ?? ''}
                  options={dataSourcesOptions}
                  onChange={onChangeDataSource}
                  disabled={!props.isEditable || statusIsDisabled}
                  onAdd={props.dataSources.size === 0 ? onAddDataSource : undefined}
                  onAddLabel={props.dataSources.size === 0 ? 'New data source' : undefined}
                /> */}
              </div>

              <div
                className={clsx(
                  'flex items-center gap-x-1 whitespace-nowrap text-[10px] text-gray-400 print:hidden',
                  {
                    hidden: !isCodeHidden && dataframeName?.value,
                  }
                )}>
                <CopyToClipboard text={dataframeName?.value ?? ''} onCopy={() => setCopied(true)}>
                  <code className="bg-primary-500/20 text-primary-700 group relative cursor-pointer rounded-md px-1.5 py-0.5 font-mono">
                    {copied ? 'Copied!' : dataframeName?.value}

                    <div className="bg-hunter-950 pointer-events-none absolute -top-2 right-0 z-20 flex w-56 -translate-y-full scale-0 flex-col gap-y-1 whitespace-normal rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:scale-100 group-hover:opacity-100">
                      <span className="text-center text-gray-400">
                        Use this variable name to reference the results as a Pandas dataframe in
                        further Python blocks. <span className="underline">Click to copy</span>.
                      </span>
                    </div>
                  </code>
                </CopyToClipboard>
              </div>
            </div>
          </div>
          <div
            className={clsx(
              'print:hidden',
              isCodeHidden ? 'invisible h-0 overflow-hidden' : 'py-5'
            )}>
            <div>
              <CodeEditor
                workspaceId={props.document.workspaceId}
                documentId={props.document.id}
                blockId={blockId}
                source={source}
                language="sql"
                readOnly={!props.isEditable || statusIsDisabled}
                onEditWithAI={onToggleEditWithAIPromptOpen}
                onRun={onRun}
                onInsertBlock={props.insertBelow}
                diff={aiSuggestions ?? undefined}
                dataSourceId={dataSourceId}
                disabled={statusIsDisabled}
              />
            </div>
          </div>
          <ApproveDiffButons
            visible={diffButtonsVisible}
            canTry={status === 'idle'}
            onTry={onTry}
            onAccept={onAcceptAISuggestion}
            onReject={onRejectAISuggestion}
          />
          {isSQLBlockEditWithAIPromptOpen(props.block) && !props.isPublicMode ? (
            <EditWithAIForm
              loading={isAIEditing}
              disabled={isAIEditing || aiSuggestions !== null}
              onSubmit={onSubmitEditWithAI}
              onClose={onCloseEditWithAIPrompt}
              value={editWithAIPrompt}
            />
          ) : (
            <div
              className={clsx('px-3 pb-3 print:hidden', {
                hidden: isCodeHidden,
              })}>
              <div className="flex justify-between text-xs">
                <div className="flex items-center">{queryStatusText}</div>
                {!props.isPublicMode &&
                  aiSuggestions === null &&
                  props.isEditable &&
                  !isFixingSQLWithAI(props.block) && (
                    <button
                      disabled={!props.isEditable}
                      onClick={onToggleEditWithAIPromptOpen}
                      className={clsx(
                        !props.isEditable || !hasOaiKey
                          ? 'cursor-not-allowed bg-gray-200'
                          : 'cusor-pointer hover:bg-gray-50 hover:text-gray-700',
                        'group relative flex items-center gap-x-2 rounded-sm border border-gray-200 px-2 py-1 font-sans text-gray-400'
                      )}>
                      <SparklesIcon className="h-3 w-3" />
                      <span>AI编辑</span>
                      <div
                        className={clsx(
                          'bg-hunter-950 pointer-events-none absolute -top-2 left-1/2 z-20 flex -translate-x-1/2 -translate-y-full flex-col items-center justify-center gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100',
                          hasOaiKey ? 'w-28' : 'w-40'
                        )}>
                        <span>{hasOaiKey ? 'Open AI edit form' : '敬请期待'}</span>
                        <span className="inline-flex items-center gap-x-1 text-gray-400">
                          {hasOaiKey ? (
                            <>
                              <span>⌘</span>
                              <span>+</span>
                              <span>e</span>
                            </>
                          ) : // <span>Admins can add an OpenAI key in settings.</span>
                          null}
                        </span>
                      </div>
                    </button>
                  )}
              </div>
            </div>
          )}
        </div>
        {result && (
          <SQLResult
            result={result}
            isPublic={false}
            documentId={props.document.id}
            workspaceId={props.document.workspaceId}
            blockId={blockId}
            dataframeName={dataframeName?.value ?? ''}
            isResultHidden={isResultHidden ?? false}
            toggleResultHidden={toggleResultHidden}
            isFixingWithAI={isFixingSQLWithAI(props.block)}
            onFixWithAI={onFixWithAI}
            dashboardMode={props.dashboardMode}
            canFixWithAI={hasOaiKey}
          />
        )}
      </div>
      <div
        className={clsx(
          'absolute right-0 top-0 flex h-full translate-x-full flex-col gap-y-1 pl-1.5 opacity-0 transition-opacity group-hover/block:opacity-100',
          isEditorFocused || statusIsDisabled ? 'opacity-100' : 'opacity-0',
          !props.isEditable ? 'hidden' : 'block'
        )}>
        <button
          onClick={onRunAbort}
          disabled={status !== 'idle' && status !== 'running'}
          className={clsx(
            {
              'cursor-not-allowed bg-gray-200': status !== 'idle' && status !== 'running',
              'bg-red-200': status === 'running' && envStatus === 'Running',
              'bg-yellow-300': status === 'running' && envStatus !== 'Running',
              'bg-primary-200': status === 'idle',
            },
            'group relative flex h-6 min-w-6 items-center justify-center rounded-sm'
          )}>
          {
            status !== 'idle' ? (
              <div>
                {execStatus === 'enqueued' ? (
                  <ClockIcon className="h-3 w-3 text-gray-500" />
                ) : (
                  <StopIcon className="h-3 w-3 text-gray-500" />
                )}
                <SQLExecTooltip
                  envStatus={envStatus}
                  envLoading={envLoading}
                  execStatus={execStatus}
                  status={status}
                />
              </div>
            ) : (
              <RunQueryTooltip />
            )
            // : (
            //   <MissingDataSourceTooltip />
            // )
          }
        </button>
        <ToChartButton layout={props.layout} block={props.block} blocks={props.blocks} />

        <HiddenInPublishedButton
          isBlockHiddenInPublished={props.isBlockHiddenInPublished}
          onToggleIsBlockHiddenInPublished={onToggleIsBlockHiddenInPublished}
          hasMultipleTabs={props.hasMultipleTabs}
        />
        {/* <button
          className="group relative flex h-6 min-w-6 items-center justify-center rounded-sm border border-gray-200 hover:bg-gray-50"
          onClick={onSchemaExplorer}>
          <BookOpenIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-500" />
          <div className="bg-hunter-950 pointer-events-none absolute -top-1 left-1/2 flex w-max max-w-40 -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            <span className="inline-flex items-center text-gray-400">
              Explore schema of selected data source.
            </span>
          </div>
        </button> */}

        {/* <SaveReusableComponentButton
          isComponent={blockId === component?.blockId}
          onSave={onSaveReusableComponent}
          disabled={!props.isEditable || isComponentInstance}
          isComponentInstance={isComponentInstance}
        /> */}
      </div>
    </div>
  )
}

type ToChartButtonProps = {
  layout: Y.Array<YBlockGroup>
  block: Y.XmlElement<SQLBlock>
  blocks: Y.Map<YBlock>
}
const ToChartButton = (props: ToChartButtonProps) => {
  const onAdd = useCallback(() => {
    const blockId = props.block.getAttribute('id')

    const blockGroup = props.layout.toArray().find((blockGroup) => {
      return blockGroup
        .getAttribute('tabs')
        ?.toArray()
        .some((tab) => {
          return tab.getAttribute('id') === blockId
        })
    })
    const blockGroupId = blockGroup?.getAttribute('id')

    if (!blockId || !blockGroupId) {
      return
    }

    addGroupedBlock(
      props.layout,
      props.blocks,
      blockGroupId,
      blockId,
      {
        type: BlockType.Visualization,
        dataframeName: props.block.getAttribute('dataframeName')?.value ?? null,
      },
      'after'
    )
  }, [props.layout, props.blocks, props.block])

  const isDisabled = props.block.getAttribute('result')?.type !== 'success'

  return (
    <button
      onClick={onAdd}
      className="group relative flex h-6 min-w-6 items-center justify-center rounded-sm border border-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-200"
      disabled={isDisabled}>
      <ChartBarIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-500" />
      <div className="bg-hunter-950 pointer-events-none absolute -top-1 left-1/2 flex w-max max-w-40 -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        <span>创建可视化</span>
        <span className="inline-flex items-center text-gray-400">
          {isDisabled ? '创建可视化之前需要先成功运行SQL查询。' : '根据SQL查询的结果创建图形'}
        </span>
      </div>
    </button>
  )
}

const MissingDataSourceTooltip = () => {
  return (
    <div>
      <PlayIcon className="h-3 w-3 text-white" />
      <div className="bg-hunter-950 pointer-events-none absolute -top-1 left-1/2 flex w-max -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        <span>没有数据输入源</span>
        <span className="inline-flex items-center text-gray-400">添加一个数据输入源</span>
      </div>
    </div>
  )
}

const RunQueryTooltip = () => {
  return (
    <div>
      <PlayIcon className="h-3 w-3 text-white" />
      <div className="bg-hunter-950 pointer-events-none absolute -top-1 left-1/2 flex w-max -translate-x-1/2 -translate-y-full flex-col gap-y-1 rounded-md p-2 font-sans text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        <span>运行查询</span>
        <span className="inline-flex items-center gap-x-1 text-gray-400">
          <span>⌘</span>
          <span>+</span>
          <span>Enter</span>
        </span>
      </div>
    </div>
  )
}

export default SQLBlock
