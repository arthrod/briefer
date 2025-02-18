import * as Y from 'yjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useResettableState from './useResettableState'
import { getDocId, useProvider } from './useYProvider'
import {
  getBlocks,
  getDashboard,
  getLastUpdatedAt,
  getLayout,
  getMetadata,
  isDirty,
  setDirty,
  switchBlockType,
  YBlock,
} from '@briefer/editor'
import { LRUCache } from 'lru-cache'
import Dexie, { EntityTable } from 'dexie'
import { useReusableComponents } from './useReusableComponents'

const db = new Dexie('YjsDatabase') as Dexie & {
  yDocs: EntityTable<{ id: string; data: Uint8Array; clock: number }, 'id'>
}

db.version(2).stores({
  yDocs: 'id, data, clock',
})

function persistYDoc(id: string, yDoc: Y.Doc, clock: number) {
  const data = Y.encodeStateAsUpdate(yDoc)
  db.yDocs.put({ id, data, clock })
}

function restoreYDoc(
  id: string,
  clock: number
): [{ clock: number; yDoc: Y.Doc }, Promise<void>] {
  const yDoc = new Y.Doc()

  const restore = db.yDocs
    .get({ id, clock })
    .then((item) => {
      if (item) {
        Y.applyUpdate(yDoc, item.data)
      }
    })
    .catch(async (e) => {
      console.error('Failed to restore Y.Doc', e)

      try {
        await db.yDocs.delete(id)
      } catch (e) {
        console.error('Failed to delete Y.Doc', e)
      }
    })

  return [{ yDoc, clock }, restore]
}

const cache = new LRUCache<string, { clock: number; yDoc: Y.Doc }>({
  max: 10,

  dispose: ({ yDoc }) => {
    yDoc.destroy()
  },
})

type GetYDocResult = {
  id: string
  cached: boolean
  yDoc: Y.Doc
  clock: number
  restore: Promise<void>
}

function getYDoc(
  documentId: string,
  isDataApp: boolean,
  clock: number,
  publishedAt: string | null
): GetYDocResult {
  const id = getDocId(documentId, isDataApp, clock, publishedAt)
  let fromCache = cache.get(id)
  const cached = Boolean(fromCache)
  let restore = Promise.resolve()

  if (!fromCache) {
    const restoreResult = restoreYDoc(id, clock)
    fromCache = restoreResult[0]
    restore = restoreResult[1]
    cache.set(id, fromCache)
  }

  return { id, cached, yDoc: fromCache.yDoc, clock: fromCache.clock, restore }
}

/**
 * Initializes and manages a Yjs document for collaborative editing.
 *
 * This custom React hook handles the lifecycle of a Yjs document by performing state
 * restoration, local persistence, caching, and synchronization with a collaborative provider.
 * It also manages component instances based on document blocks and integrates undo/redo functionality
 * through Yjs's UndoManager. The hook sets up multiple side effects:
 *
 * - Restores the document state and updates local persistence.
 * - Observes document updates to mark changes and handle component instance removal.
 * - Connects to and manages the provider lifecycle, including synchronization events.
 * - Applies an initial state update to the document if provided.
 *
 * @param workspaceId - The identifier of the workspace in which the document is used.
 * @param documentId - The unique identifier of the Yjs document.
 * @param isDataApp - A flag indicating whether the document is associated with a data application.
 * @param clock - A numeric value used to ensure document state consistency.
 * @param userId - The current user's ID, or null if not applicable.
 * @param publishedAt - The publication timestamp of the document, or null.
 * @param connect - Flag to determine if the provider should automatically be connected.
 * @param initialState - An optional buffer containing an initial update to apply to the Yjs document.
 *
 * @returns An object containing:
 *  - yDoc: The Yjs document instance.
 *  - provider: The collaborative provider responsible for document synchronization.
 *  - syncing: A boolean indicating whether the document is currently synchronizing.
 *  - isDirty: A flag reflecting whether there are unsaved changes in the document state.
 *  - undo: A function to revert the last change using the integrated UndoManager.
 *  - redo: A function to reapply a previously undone change using the integrated UndoManager.
 *
 * @example
 * const { yDoc, provider, syncing, isDirty, undo, redo } = useYDoc(
 *   'workspace123',
 *   'doc456',
 *   true,
 *   42,
 *   'user789',
 *   null,
 *   true,
 *   null
 * );
 *
 * // To undo a change:
 * undo();
 *
 * // To redo a change:
 * redo();
 */
export function useYDoc(
  workspaceId: string,
  documentId: string,
  isDataApp: boolean,
  clock: number,
  userId: string | null,
  publishedAt: string | null,
  connect: boolean,
  initialState: Buffer | null
) {
  const isFirst = useRef(true)
  const [{ id, cached, yDoc, restore }, setYDoc] = useState(() =>
    getYDoc(documentId, isDataApp, clock, publishedAt)
  )
  const [restoring, setRestoring] = useResettableState(() => true, [restore])
  useEffect(() => {
    restore.then(() => {
      setRestoring(false)
    })
  }, [restore])

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return () => {
        persistYDoc(id, yDoc, clock)
      }
    }

    const next = getYDoc(documentId, isDataApp, clock, publishedAt)
    setYDoc(next)
    return () => {
      persistYDoc(next.id, next.yDoc, next.clock)
    }
  }, [documentId, isDataApp, clock, publishedAt, userId])

  const metadata = useYDocState(yDoc, getMetadata)
  const provider = useProvider(
    yDoc,
    documentId,
    isDataApp,
    clock,
    userId,
    publishedAt
  )
  const [syncing, setSyncing] = useResettableState(() => true, [provider])
  useEffect(() => {
    const onSynced = (synced: boolean) => {
      setSyncing(!synced)
    }

    provider.onSynced(onSynced)

    return () => {
      provider.offSynced(onSynced)
    }
  }, [provider])

  useEffect(() => {
    if (initialState) {
      Y.applyUpdate(yDoc, initialState)
    }
  }, [initialState])

  useEffect(() => {
    if (connect) {
      provider.connect()
    }

    return () => {
      provider.destroy()
    }
  }, [provider, connect])

  useEffect(() => {
    if (syncing) {
      console.time(`${documentId} sync`)
      console.log(`${documentId} syncing`, new Date().toISOString())
      return
    }
    console.timeEnd(`${documentId} sync`)
    console.log(`${documentId} not syncing`, new Date().toISOString())

    const update = (
      _update: Uint8Array,
      _: any,
      yDoc: Y.Doc,
      tr: Y.Transaction
    ) => {
      if (syncing || !tr.local) {
        return
      }

      if (!isDirty(yDoc)) {
        setDirty(yDoc)
      }
    }

    yDoc.on('update', update)

    return () => {
      yDoc.off('update', update)
    }
  }, [yDoc, syncing])

  const [, { removeInstance: removeComponentInstance }] =
    useReusableComponents(workspaceId)
  useEffect(() => {
    const blocks = getBlocks(yDoc)

    // map of blockId to componentId
    const components: Map<string, string> = new Map()
    const updateComponents = (blockId: string) => {
      const block = blocks.get(blockId)
      if (!block) {
        return
      }

      const componentId = switchBlockType(block, {
        onSQL: (block) => block.getAttribute('componentId'),
        onPython: (block) => block.getAttribute('componentId'),
        onRichText: () => null,
        onVisualization: () => null,
        onVisualizationV2: () => null,
        onInput: () => null,
        onDropdownInput: () => null,
        onDateInput: () => null,
        onFileUpload: () => null,
        onDashboardHeader: () => null,
        onWriteback: () => null,
        onPivotTable: () => null,
      })

      if (componentId) {
        components.set(blockId, componentId)
      }
    }

    for (const blockId of Array.from(blocks.keys())) {
      updateComponents(blockId)
    }

    const onUpdate = (evt: Y.YMapEvent<YBlock>) => {
      const changes = evt.changes.keys
      for (const [blockId, { action }] of Array.from(changes.entries())) {
        if (action === 'add' || action === 'update') {
          updateComponents(blockId)
        } else if (action === 'delete') {
          const componentId = components.get(blockId)
          if (componentId) {
            components.delete(blockId)
            removeComponentInstance(workspaceId, componentId, blockId)
          }
        }
      }
    }

    blocks.observe(onUpdate)

    return () => {
      blocks.unobserve(onUpdate)
    }
  }, [yDoc, removeComponentInstance])

  const undoManager = useMemo(
    () =>
      new Y.UndoManager([getLayout(yDoc), getBlocks(yDoc), getDashboard(yDoc)]),
    [yDoc]
  )

  const undo = useCallback(() => {
    undoManager.undo()
  }, [undoManager])

  const redo = useCallback(() => {
    undoManager.redo()
  }, [undoManager])

  return {
    yDoc,
    provider,
    syncing: (syncing || restoring) && !cached,
    isDirty: metadata.state.value.getAttribute('isDirty') ?? false,
    undo,
    redo,
  }
}

/**
 * Custom React hook to track and update a derived state from a Yjs document.
 *
 * This hook initializes a state using the provided getter applied to the Yjs document.
 * It sets up a deep observer on the resulting Yjs type so that any changes trigger an update
 * to the internal state. The state is resettable and automatically updated when the Yjs document or
 * getter function changes.
 *
 * @param yDoc - The Yjs document used as the source for the state.
 * @param getter - A function that extracts a specific Yjs AbstractType from the Yjs document.
 * @returns An object containing the original Yjs document and a state object holding the tracked value.
 *
 * @example
 * const { yDoc, state } = useYDocState(doc, doc => doc.get('blocks') as Y.Array<any>);
 */
export function useYDocState<T extends Y.AbstractType<any>>(
  yDoc: Y.Doc,
  getter: (doc: Y.Doc) => T
) {
  const [state, setState] = useResettableState<{ value: T }>(
    () => ({ value: getter(yDoc) }),
    [yDoc]
  )

  useEffect(() => {
    const onUpdate = () => {
      setState({ value: getter(yDoc) })
    }

    state.value.observeDeep(onUpdate)

    return () => {
      state.value.unobserveDeep(onUpdate)
    }
  }, [yDoc, state.value, getter])

  return { yDoc, state }
}

export function useLastUpdatedAt(yDoc: Y.Doc): string | null {
  const [lastUpdatedAt, setLastUpdatedAt] = useResettableState<string | null>(
    () => getLastUpdatedAt(yDoc),
    [yDoc]
  )

  useEffect(() => {
    const onUpdate = () => {
      setLastUpdatedAt(getLastUpdatedAt(yDoc))
    }
    yDoc.on('update', onUpdate)

    return () => {
      yDoc.off('update', onUpdate)
    }
  }, [yDoc])

  return lastUpdatedAt
}
