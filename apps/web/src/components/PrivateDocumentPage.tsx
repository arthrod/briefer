import dynamic from 'next/dynamic'

import { useDataSources } from '@/hooks/useDatasources'
import useDocument from '@/hooks/useDocument'
import React, { ReactElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import type { ApiDocument, ApiUser, UserWorkspaceRole } from '@briefer/database'
import { isNil } from 'ramda'
import { useDocuments } from '@/hooks/useDocuments'
import Comments from './Comments'
import RunAllV2 from './RunAllV2'
import useFullScreenDocument from '@/hooks/useFullScreenDocument'
import Schedules from './Schedules'
import Snapshots from './Snapshots'
import { useYDoc } from '@/hooks/useYDoc'
import EllipsisDropdown from './EllipsisDropdown'
import Link from 'next/link'
import { useSession } from '@/hooks/useAuth'

import { BookUpIcon } from 'lucide-react'
import clsx from 'clsx'
import { widthClasses } from './v2Editor/constants'
import { ContentSkeleton, TitleSkeleton } from './v2Editor/ContentSkeleton'
import Files from './Files'
import { PublishBlinkingSignal } from './BlinkingSignal'
import { Tooltip } from './Tooltips'
import SchemaExplorer from './schemaExplorer'
import ShortcutsModal from './ShortcutsModal'
import { NEXT_PUBLIC_PUBLIC_URL } from '@/utils/env'
import ReusableComponents from './ReusableComponents'
import PageSettingsPanel from './PageSettingsPanel'

import styles from './PrivateDocumentPage.module.scss'
// this is needed because this component only works with the browser
const V2Editor = dynamic(() => import('@/components/v2Editor'), {
  ssr: false,
})

interface Props {
  updateTopBar?: (ele: ReactElement) => void
  workspaceId: string
  documentId: string
  user: ApiUser & { roles: Record<string, UserWorkspaceRole> }
  isApp: boolean
}

export default function PrivateDocumentPage(props: Props) {
  const [{ document, loading, publishing }, { publish }] = useDocument(
    props.workspaceId,
    props.documentId
  )

  if (loading || !document) {
    return (
      <div className="flex w-full justify-center">
        <div className={clsx(widthClasses, 'py-20')}>
          <TitleSkeleton visible />
          <ContentSkeleton visible />
        </div>
      </div>
    )
  }

  return (
    <PrivateDocumentPageInner
      {...props}
      document={document}
      publish={publish}
      publishing={publishing}
    />
  )
}

function PrivateDocumentPageInner(
  props: Props & {
    document: ApiDocument
    publish: () => Promise<void>
    publishing: boolean
  }
) {
  const documentTitle = useMemo(() => props.document.title || 'Untitled', [props.document.title])

  const [selectedSidebar, setSelectedSidebar] = useState<
    | { _tag: 'comments' }
    | { _tag: 'schedules' }
    | { _tag: 'snapshots' }
    | { _tag: 'files' }
    | { _tag: 'schemaExplorer'; dataSourceId: string | null }
    | { _tag: 'shortcuts' }
    | { _tag: 'reusableComponents' }
    | { _tag: 'pageSettings' }
    | null
  >(null)

  const [{ data: dataSources }] = useDataSources(props.workspaceId)

  const onHideSidebar = useCallback(() => {
    setSelectedSidebar(null)
  }, [setSelectedSidebar])

  const onToggleComments = useCallback(() => {
    setSelectedSidebar((v) => (v?._tag === 'comments' ? null : { _tag: 'comments' }))
  }, [setSelectedSidebar])

  const onToggleShortcuts = useCallback(() => {
    setSelectedSidebar((v) => (v?._tag === 'shortcuts' ? null : { _tag: 'shortcuts' }))
  }, [setSelectedSidebar])

  const onToggleReusableComponents = useCallback(() => {
    setSelectedSidebar((v) =>
      v?._tag === 'reusableComponents' ? null : { _tag: 'reusableComponents' }
    )
  }, [setSelectedSidebar])

  const onToggleSchemaExplorerEllipsis = useCallback(() => {
    setSelectedSidebar((v) =>
      v?._tag === 'schemaExplorer' ? null : { _tag: 'schemaExplorer', dataSourceId: null }
    )
  }, [setSelectedSidebar])

  const onToggleSchemaExplorerSQLBlock = useCallback(
    (dataSourceId?: string | null) => {
      setSelectedSidebar((v) =>
        v?._tag === 'schemaExplorer' && v.dataSourceId === dataSourceId
          ? null
          : { _tag: 'schemaExplorer', dataSourceId: dataSourceId ?? null }
      )
    },
    [setSelectedSidebar]
  )

  const onToggleSchedules = useCallback(() => {
    setSelectedSidebar((v) => (v?._tag === 'schedules' ? null : { _tag: 'schedules' }))
  }, [setSelectedSidebar])

  const onToggleSnapshots = useCallback(() => {
    setSelectedSidebar((v) => (v?._tag === 'snapshots' ? null : { _tag: 'snapshots' }))
  }, [setSelectedSidebar])

  const onToggleFiles = useCallback(() => {
    setSelectedSidebar((v) => (v?._tag === 'files' ? null : { _tag: 'files' }))
  }, [setSelectedSidebar])

  const onTogglePageSettings = useCallback(() => {
    setSelectedSidebar((v) => (v?._tag === 'pageSettings' ? null : { _tag: 'pageSettings' }))
  }, [setSelectedSidebar])

  const router = useRouter()
  const copyLink = useMemo(
    () =>
      `${NEXT_PUBLIC_PUBLIC_URL()}/workspaces/${props.workspaceId}/documents/${props.documentId}`,
    [router]
  )

  const isViewer = props.user.roles[props.workspaceId] === 'viewer'
  const isDeleted = !isNil(props.document.deletedAt)

  const [isFullScreen, { toggle: onToggleFullScreen }] = useFullScreenDocument(props.document.id)

  const [, { restoreDocument }] = useDocuments(props.workspaceId)
  const onRestoreDocument = useCallback(() => {
    restoreDocument(props.documentId)
  }, [props.documentId, restoreDocument])

  const session = useSession()
  const firstLetter = session.data?.loginName.charAt(0).toUpperCase() // 获取用户名的第一个字母并转为大写

  const clock = useMemo(() => {
    if (!props.isApp) {
      return props.document.clock
    }

    return props.document.userAppClock[props.user.id] ?? props.document.appClock
  }, [
    props.isApp,
    props.document.clock,
    props.document.userAppClock,
    props.document.appClock,
    props.user.id,
  ])

  const { yDoc, provider, syncing, isDirty } = useYDoc(
    props.document.id,
    props.isApp,
    clock,
    props.user.id,
    props.document.publishedAt,
    true,
    null
  )

  const onPublish = useCallback(async () => {
    if (props.publishing) {
      return
    }

    await props.publish()

    router.push(
      `/workspaces/${props.document.workspaceId}/documents/${props.document.id}/notebook${window.location.search}`
    )
  }, [props.publishing, props.publish])

  const topBarContent = useMemo(() => {
    return (
      <div className="flex w-full items-center justify-between gap-x-6">
        <div className="flex w-full items-center gap-x-1.5 overflow-hidden font-sans text-sm text-gray-400">
          <span className="flex w-full items-center truncate">{documentTitle}</span>
        </div>

        <div className="flex h-[36px] w-full items-center justify-end gap-x-4">
          {!isViewer && <RunAllV2 disabled={false} yDoc={yDoc} primary={props.isApp} />}
          {props.isApp ? (
            <Link
              className="flex items-center gap-x-1.5 rounded-sm px-3 py-2 text-sm"
              href={`/workspaces/${props.document.workspaceId}/documents/${props.document.id}/notebook/edit${window.location.search}`}>
              <img className="h-4 w-4" src="/icons/edit.svg" alt="" />
              <span>编辑</span>
            </Link>
          ) : (
            <Tooltip
              title="Click to publish"
              message="This notebook has unpublished changes."
              active={props.document.publishedAt !== null && isDirty}
              position="bottom"
              tooltipClassname="w-40">
              <button
                className="bg-primary-200 hover:bg-primary-300 group relative flex items-center gap-x-1.5 rounded-sm px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={onPublish}
                disabled={props.publishing}>
                <BookUpIcon
                  className="duration-400 h-4 w-4 rotate-12 transition-transform group-hover:rotate-0"
                  strokeWidth={1}
                />
                <span>预览</span>
                {isDirty && props.document.publishedAt && <PublishBlinkingSignal />}
              </button>
            </Tooltip>
          )}

          <EllipsisDropdown
            onToggleSchedules={onToggleSchedules}
            onToggleSnapshots={onToggleSnapshots}
            onToggleComments={onToggleComments}
            onToggleFullScreen={onToggleFullScreen}
            onToggleFiles={onToggleFiles}
            onToggleSchemaExplorer={onToggleSchemaExplorerEllipsis}
            onToggleReusableComponents={onToggleReusableComponents}
            onToggleShortcuts={onToggleShortcuts}
            onTogglePageSettings={onTogglePageSettings}
            isViewer={isViewer}
            isDeleted={isDeleted}
            isFullScreen={isFullScreen}
          />
          <div
            className={styles.userAvatar}
            onClick={() => {
              router.push('/user/profile')
            }}>
            {firstLetter}
          </div>
        </div>
      </div>
    )
  }, [documentTitle, yDoc])

  useEffect(() => {
    props.updateTopBar && props.updateTopBar(topBarContent)
  }, [topBarContent])

  return (
    <div className="relative flex w-full">
      <V2Editor
        document={props.document}
        dataSources={dataSources}
        isPublicViewer={false}
        isDeleted={isDeleted}
        onRestoreDocument={onRestoreDocument}
        isEditable={!props.isApp}
        isPDF={false}
        isApp={props.isApp}
        userId={props.user.id}
        role={props.user.roles[props.workspaceId]}
        isFullScreen={isFullScreen}
        yDoc={yDoc}
        provider={provider}
        isSyncing={syncing}
        onOpenFiles={onToggleFiles}
        onSchemaExplorer={onToggleSchemaExplorerSQLBlock}
      />

      <Comments
        workspaceId={props.workspaceId}
        documentId={props.documentId}
        visible={selectedSidebar?._tag === 'comments'}
        onHide={onHideSidebar}
      />

      <SchemaExplorer
        workspaceId={props.workspaceId}
        visible={selectedSidebar?._tag === 'schemaExplorer'}
        onHide={onHideSidebar}
        dataSourceId={
          selectedSidebar?._tag === 'schemaExplorer' ? selectedSidebar.dataSourceId : null
        }
        canRetrySchema={!isViewer}
      />

      <ShortcutsModal visible={selectedSidebar?._tag === 'shortcuts'} onHide={onHideSidebar} />

      {!isViewer && !isDeleted && (
        <>
          <Schedules
            workspaceId={props.workspaceId}
            documentId={props.documentId}
            isPublished={props.document.publishedAt !== null}
            visible={selectedSidebar?._tag === 'schedules'}
            onHide={onHideSidebar}
            onPublish={onPublish}
            publishing={props.publishing}
          />
          <Snapshots
            workspaceId={props.workspaceId}
            documentId={props.documentId}
            visible={selectedSidebar?._tag === 'snapshots'}
            onHide={onHideSidebar}
            isPublished={props.document.publishedAt !== null}
          />
          <Files
            workspaceId={props.workspaceId}
            visible={selectedSidebar?._tag === 'files'}
            onHide={onHideSidebar}
            yDoc={yDoc}
          />
          <ReusableComponents
            workspaceId={props.workspaceId}
            visible={selectedSidebar?._tag === 'reusableComponents'}
            onHide={onHideSidebar}
            yDoc={yDoc}
          />
          <PageSettingsPanel
            workspaceId={props.workspaceId}
            documentId={props.documentId}
            visible={selectedSidebar?._tag === 'pageSettings'}
            onHide={onHideSidebar}
          />
        </>
      )}
    </div>
  )
}
