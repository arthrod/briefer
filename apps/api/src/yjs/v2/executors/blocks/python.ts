import debounce from 'lodash.debounce'
import {
  PythonBlock,
  YBlock,
  YBlockGroup,
  closePythonEditWithAIPrompt,
  getPythonAttributes,
  getPythonBlockEditWithAIPrompt,
  getPythonBlockResult,
  getPythonSource,
  updatePythonAISuggestions,
} from '@briefer/editor'
import PQueue from 'p-queue'
import * as Y from 'yjs'
import { writeFile } from 'fs/promises'
import { promises as fs } from 'fs'

import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { updateDataframes } from '../index.js'

import { logger } from '../../../../logger.js'
import { executeCode as executePython } from '../../../../python/index.js'
import { DataFrame, PythonErrorOutput } from '@briefer/types'
import { listDataFrames } from '../../../../python/query/index.js'
import { pythonEditStreamed } from '../../../../ai-api.js'
import { prisma, getWorkspaceWithSecrets } from '@briefer/database'
import { EventContext, PythonEvents } from '../../../../events/index.js'
import { run_cell_pre, run_cell_request_code } from '../run-cell.js'

/**
 * Edits the given source code using AI based on provided instructions.
 *
 * This asynchronous function first retrieves workspace configuration (if a valid workspaceId is provided)
 * to obtain details like the assistant model and OpenAI API key. It then triggers the AI editing operation
 * via the `pythonEditStreamed` function, streaming modifications to the source code. The provided `event`
 * callback is invoked with the assistant model (if available) before processing, while the updated source
 * is delivered through the `onSource` callback.
 *
 * @param workspaceId - Identifier for the workspace whose configuration is used for AI editing.
 * @param source - The original source code to be edited.
 * @param instructions - The AI instructions to guide the code editing process.
 * @param dataFrames - Array of DataFrame objects relevant to the code context.
 * @param event - Callback function that receives the assistant model identifier (or null if unavailable).
 * @param onSource - Callback function that receives the updated source code after AI editing.
 *
 * @throws Will throw an error if an error occurs during fetching workspace details or executing the AI edit.
 */
async function editWithAI(
  workspaceId: string,
  source: string,
  instructions: string,
  dataFrames: DataFrame[],
  event: (modelId: string | null) => void,
  onSource: (source: string) => void
) {
  const workspace = workspaceId ? await getWorkspaceWithSecrets(workspaceId) : null

  event(workspace?.assistantModel ?? null)

  await pythonEditStreamed(
    source,
    instructions,
    dataFrames,
    onSource,
    workspace?.assistantModel ?? null,
    workspace?.secrets?.openAiApiKey ?? null
  )
}

export type PythonEffects = {
  executePython: typeof executePython
  listDataFrames: typeof listDataFrames
  editWithAI: typeof editWithAI
}

type RunninCode = {
  abortController: AbortController
  abort?: () => Promise<void>
}

export interface IPythonExecutor {
  run(block: Y.XmlElement<PythonBlock>, tr: Y.Transaction, isSuggestion: boolean): Promise<void>
  abort(block: Y.XmlElement<PythonBlock>, tr: Y.Transaction): Promise<void>
  isIdle(): boolean
  editWithAI(block: Y.XmlElement<PythonBlock>, tr: Y.Transaction): Promise<void>
  fixWithAI(block: Y.XmlElement<PythonBlock>, tr: Y.Transaction): Promise<void>
}

export class PythonExecutor implements IPythonExecutor {
  private workspaceId: string
  private documentId: string
  private executionQueue: PQueue
  private runningCode = new Map<Y.XmlElement<PythonBlock>, RunninCode>()
  private dataframes: Y.Map<DataFrame>
  private blocks: Y.Map<YBlock>
  private layout: Y.Array<YBlockGroup>
  private effects: PythonEffects
  private events: PythonEvents

  constructor(
    workspaceId: string,
    documentId: string,
    dataframes: Y.Map<DataFrame>,
    blocks: Y.Map<YBlock>,
    layout: Y.Array<YBlockGroup>,
    executionQueue: PQueue,
    effects: PythonEffects,
    events: PythonEvents
  ) {
    this.workspaceId = workspaceId
    this.documentId = documentId
    this.dataframes = dataframes
    this.blocks = blocks
    this.layout = layout
    this.executionQueue = executionQueue
    this.effects = effects
    this.events = events
  }

  public isIdle() {
    return this.executionQueue.size === 0 && this.executionQueue.pending === 0
  }

  public async run(block: Y.XmlElement<PythonBlock>, tr: Y.Transaction, isSuggestion: boolean) {
    this.events.pythonRun(EventContext.fromYTransaction(tr))

    const abortController = new AbortController()
    const runningCode: RunninCode = { abortController }
    this.runningCode.set(block, runningCode)
    block.setAttribute('result', [])

    try {
      const code = await run_cell_pre(
        this.documentId,
        this.workspaceId,
        block.getAttribute('id') || '',
        this.blocks,
        this.layout
      )

      logger().trace(
        {
          workspaceId: this.workspaceId,
          documentId: this.documentId,
          blockId: block.getAttribute('id'),
          queeueSize: this.executionQueue.size,
        },
        'enqueueing python block execution'
      )

      await this.executionQueue.add(
        async ({ signal }) => {
          logger().trace(
            {
              workspaceId: this.workspaceId,
              documentId: this.documentId,
              blockId: block.getAttribute('id'),
            },
            'executing python block'
          )

          const { aiSuggestions, source, id: blockId } = getPythonAttributes(block)

          const actualSource = code.toString()

          const { promise, abort } = await this.effects.executePython(
            this.workspaceId,
            this.documentId,
            actualSource,
            (outputs) => {
              const prevOutputs = block.getAttribute('result') ?? []
              block.setAttribute('result', prevOutputs.concat(outputs))
            },
            { storeHistory: true }
          )
          runningCode.abort = abort
          if (signal?.aborted) {
            await abort()
          }

          await promise
          await this.updateDataFrames(blockId)

          block.setAttribute('status', 'idle')
          block.setAttribute('lastQuery', block.getAttribute('source')!.toJSON())
          block.setAttribute('lastQueryTime', new Date().toISOString())
          logger().trace(
            {
              workspaceId: this.workspaceId,
              documentId: this.documentId,
              blockId: block.getAttribute('id'),
            },
            'python block executed'
          )
        },
        { signal: abortController.signal }
      )
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }

      throw e
    }
  }

  public async abort(block: Y.XmlElement<PythonBlock>) {
    logger().trace(
      {
        workspaceId: this.workspaceId,
        documentId: this.documentId,
        blockId: block.getAttribute('id'),
      },
      'aborting python block execution'
    )

    const running = this.runningCode.get(block)
    if (!running) {
      block.setAttribute('status', 'idle')
      return
    }

    running.abortController.abort()
    await running.abort?.()

    logger().trace(
      {
        workspaceId: this.workspaceId,
        documentId: this.documentId,
        blockId: block.getAttribute('id'),
      },
      'python block execution aborted'
    )
  }

  public async editWithAI(block: Y.XmlElement<PythonBlock>, tr: Y.Transaction) {
    const instructions = getPythonBlockEditWithAIPrompt(block).toJSON()
    if (!instructions) {
      return
    }

    const source = getPythonSource(block).toJSON()

    await this.effects.editWithAI(
      this.workspaceId,
      source,
      instructions,
      Array.from(this.dataframes.values()),
      (modelId) => {
        this.events.aiUsage(EventContext.fromYTransaction(tr), 'python', 'edit', modelId)
      },
      debounce((suggestions) => {
        updatePythonAISuggestions(block, suggestions)
      }, 50)
    )
    closePythonEditWithAIPrompt(block, true)
  }

  public async fixWithAI(block: Y.XmlElement<PythonBlock>, tr: Y.Transaction) {
    const error = getPythonBlockResult(block).find(
      (r): r is PythonErrorOutput => r.type === 'error'
    )
    if (!error) {
      return
    }

    const instructions = `Fix the Python code, this is the error: ${JSON.stringify({
      ...error,
      traceback: error.traceback.slice(0, 2),
    })}`
    const source = getPythonSource(block).toJSON()

    await this.effects.editWithAI(
      this.workspaceId,
      source,
      instructions,
      Array.from(this.dataframes.values()),
      (modelId) => {
        this.events.aiUsage(EventContext.fromYTransaction(tr), 'python', 'fix', modelId)
      },
      debounce((suggestions) => {
        updatePythonAISuggestions(block, suggestions)
      }, 50)
    )
  }

  private async updateDataFrames(blockId: string) {
    const newDataframes = await this.effects.listDataFrames(this.workspaceId, this.documentId)

    const blocks = new Set(Array.from(this.blocks.keys()))

    updateDataframes(this.dataframes, newDataframes, blockId, blocks)
  }

  public static make(
    workspaceId: string,
    documentId: string,
    dataframes: Y.Map<DataFrame>,
    blocks: Y.Map<YBlock>,
    layout: Y.Array<YBlockGroup>,

    executionQueue: PQueue,
    events: PythonEvents
  ) {
    return new PythonExecutor(
      workspaceId,
      documentId,
      dataframes,
      blocks,
      layout,
      executionQueue,
      {
        executePython,
        listDataFrames,
        editWithAI,
      },
      events
    )
  }
}
