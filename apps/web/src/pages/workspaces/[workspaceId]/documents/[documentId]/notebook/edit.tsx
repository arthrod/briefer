import { getQueryParam, useStringQuery } from '@/hooks/useQueryArgs'
import { SessionUser, useSession } from '@/hooks/useAuth'
import PrivateDocumentPage from '@/components/PrivateDocumentPage'
import useDocument from '@/hooks/useDocument'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import WorkspaceLayout, { WorkspaceLayoutChildrenProps } from '@/components/WorkspaceLayout'
import { ContentSkeleton, TitleSkeleton } from '@/components/v2Editor/ContentSkeleton'
import clsx from 'clsx'
import { widthClasses } from '@/components/v2Editor/constants'
import { useChatLayoutContext } from '@/components/mf/ChatLayout'

function Skeleton() {
  return (
    <div className="flex w-full justify-center">
      <div className={clsx(widthClasses, 'py-20')}>
        <TitleSkeleton visible />
        <ContentSkeleton visible />
      </div>
    </div>
  )
}

export default function EditNotebookPage(props: WorkspaceLayoutChildrenProps) {
  const session = useSession()
  const workspaceId = useStringQuery('workspaceId')
  const documentId = useStringQuery('documentId')
  const chatId = getQueryParam('chatId')

  const { loadDetail } = useChatLayoutContext()

  const router = useRouter()

  useEffect(() => {
    loadDetail(chatId)
  }, [])

  useEffect(() => {
    const role = session.data?.roles[workspaceId]
    if (!role && !session.isLoading) {
      router.replace(`/workspaces/${workspaceId}/documents/${documentId}`)
    }
  }, [session.data, workspaceId, documentId])

  if (!session.data || !session.data.roles[workspaceId]) {
    return <Skeleton />
  }

  return (
    <EditNotebook
      {...props}
      workspaceId={workspaceId}
      documentId={documentId}
      user={session.data}
    />
  )
}

EditNotebookPage.layout = WorkspaceLayout

interface EditNotebookProps extends WorkspaceLayoutChildrenProps {
  workspaceId: string
  documentId: string
  user: SessionUser
}

function EditNotebook(props: EditNotebookProps) {
  const [{ document, loading }] = useDocument(props.workspaceId, props.documentId)

  // const router = useRouter()

  useEffect(() => {
    if (loading) {
      return
    }

    // if (!document) {
    //   router.replace(`/workspaces/${props.workspaceId}${window.location.search}`)
    // }
    window.document.title = document?.title || 'Untitled'
  }, [document, loading, props.user])

  if (loading || !document) {
    return <Skeleton />
  }

  return (
    <PrivateDocumentPage
      {...props}
      key={props.documentId}
      workspaceId={props.workspaceId}
      documentId={props.documentId}
      user={props.user}
      isApp={false}
    />
  )
}
