import * as Y from 'yjs'
import {
  RunQueryResult,
  SQLQueryConfiguration,
  TableSort,
} from '@briefer/types'
import {
  BlockType,
  BaseBlock,
  YBlock,
  getAttributeOr,
  getBaseAttributes,
  duplicateBaseAttributes,
  duplicateYText,
} from './index.js'
import { ResultStatus, updateYText } from '../index.js'
import { clone } from 'ramda'

export type DataframeName = {
  value: string
  newValue: string
  error?: 'invalid-name' | 'unexpected'
}

export type SQLBlock = BaseBlock<BlockType.SQL> & {
  source: Y.Text
  dataframeName: DataframeName
  dataSourceId: string | null
  isFileDataSource: boolean
  result: RunQueryResult | null
  page: number
  dashboardPage: number
  dashboardPageSize: number
  lastQuery: string | null
  lastQueryTime: string | null
  startQueryTime: string | null
  isCodeHidden: boolean
  isResultHidden: boolean
  editWithAIPrompt: Y.Text
  isEditWithAIPromptOpen: boolean
  aiSuggestions: Y.Text | null
  configuration: SQLQueryConfiguration | null
  sort: TableSort | null

  // wether the block originated from a reusable component and the id of the component
  componentId: string | null
}

export const isSQLBlock = (block: YBlock): block is Y.XmlElement<SQLBlock> => {
  return block.getAttribute('type') === BlockType.SQL
}

export const makeSQLBlock = (
  id: string,
  blocks: Y.Map<YBlock>,
  opts?: {
    dataSourceId?: string | null
    isFileDataSource?: boolean
    source?: string
  }
): Y.XmlElement<SQLBlock> => {
  const yBlock = new Y.XmlElement<SQLBlock>('block')
  const attrs: SQLBlock = {
    id: id,
    index: null,
    type: BlockType.SQL,
    title: '',
    source: new Y.Text(opts?.source ?? ''),
    dataframeName: getDataframeName(blocks, 'query_1'),
    dataSourceId: opts?.dataSourceId ?? null,
    isFileDataSource: opts?.isFileDataSource ?? false,
    result: null,
    page: 0,
    dashboardPage: 0,
    dashboardPageSize: 6,
    lastQuery: null,
    lastQueryTime: null,
    startQueryTime: null,
    isCodeHidden: false,
    isResultHidden: false,
    editWithAIPrompt: new Y.Text(''),
    isEditWithAIPromptOpen: false,
    aiSuggestions: null,
    componentId: null,
    configuration: null,
    sort: null,
  }

  for (const [key, value] of Object.entries(attrs)) {
    // @ts-ignore
    yBlock.setAttribute(key, value)
  }

  return yBlock
}

/**
 * Retrieves and consolidates all attributes for a SQL block element.
 *
 * This function merges the base block attributes with SQL-specific properties extracted
 * from the provided XML element. In particular, if the `dataframeName` attribute is not set,
 * a default name is generated using the `getDataframeName` function with a prefix of 'query_1'.
 * Additional properties such as source text, data source IDs, pagination details, query timestamps,
 * AI prompt state, and other configuration options are also retrieved and returned.
 *
 * @param block - The XML element representing the SQL block.
 * @param blocks - A map of all Yjs blocks used to derive defaults (e.g., for generating unique dataframe names).
 * @returns A SQLBlock object that includes both the base block attributes and SQL-specific properties.
 */
export function getSQLAttributes(
  block: Y.XmlElement<SQLBlock>,
  blocks: Y.Map<YBlock>
): SQLBlock {
  return {
    ...getBaseAttributes(block),
    source: getSQLSource(block),
    dataframeName: getAttributeOr(
      block,
      'dataframeName',
      getDataframeName(blocks, 'query_1')
    ),
    dataSourceId: getAttributeOr(block, 'dataSourceId', null),
    isFileDataSource: getAttributeOr(block, 'isFileDataSource', false),
    result: getAttributeOr(block, 'result', null),
    page: getAttributeOr(block, 'page', 0),
    dashboardPage: getAttributeOr(block, 'dashboardPage', 0),
    dashboardPageSize: getAttributeOr(block, 'dashboardPageSize', 6),
    lastQuery: getAttributeOr(block, 'lastQuery', null),
    lastQueryTime: getAttributeOr(block, 'lastQueryTime', null),
    startQueryTime: getAttributeOr(block, 'startQueryTime', null),
    isCodeHidden: getAttributeOr(block, 'isCodeHidden', false),
    isResultHidden: getAttributeOr(block, 'isResultHidden', false),
    editWithAIPrompt: getSQLBlockEditWithAIPrompt(block),
    isEditWithAIPromptOpen: getAttributeOr(
      block,
      'isEditWithAIPromptOpen',
      false
    ),
    aiSuggestions: getSQLAISuggestions(block),
    componentId: getAttributeOr(block, 'componentId', null),
    configuration: getAttributeOr(block, 'configuration', null),
    sort: getAttributeOr(block, 'sort', null),
  }
}

/**
 * Creates a duplicate of an existing SQL block with a new identifier and optionally refreshed state.
 *
 * This function clones the attributes of a given SQL block, including its base and SQL-specific properties,
 * and returns a new Y.XmlElement containing the duplicated block. It duplicates internal Yjs text attributes and,
 * if specified, resets stateful properties such as query results and timings when the `noState` option is provided.
 * If the `newVariableName` option is true, it generates a new dataframe name based on the current name using a prefix.
 *
 * @param newId - The unique identifier for the new SQL block.
 * @param block - The original SQL block to duplicate.
 * @param blocks - A map of all blocks used to generate a unique dataframe name.
 * @param options - Optional parameters to control the duplication behavior:
 *   - datasourceMap: A mapping of old to new data source IDs.
 *   - componentId: An identifier for the component context.
 *   - noState: If true, stateful properties (query results, timings, etc.) are reset.
 *   - newVariableName: If true, regenerates the dataframe name using the current value as a prefix.
 *
 * @returns A new Y.XmlElement representing the duplicated SQL block with updated attributes.
 */
export function duplicateSQLBlock(
  newId: string,
  block: Y.XmlElement<SQLBlock>,
  blocks: Y.Map<YBlock>,
  options?: {
    datasourceMap?: Map<string, string>
    componentId?: string
    noState?: boolean
    newVariableName?: boolean
  }
): Y.XmlElement<SQLBlock> {
  const prevAttributes = getSQLAttributes(block, blocks)

  const nextAttributes: SQLBlock = {
    ...duplicateBaseAttributes(newId, prevAttributes),
    source: duplicateYText(prevAttributes.source),
    dataframeName: clone(prevAttributes.dataframeName),
    dataSourceId: prevAttributes.dataSourceId
      ? options?.datasourceMap?.get(prevAttributes.dataSourceId) ??
        prevAttributes.dataSourceId
      : null,
    isFileDataSource: prevAttributes.isFileDataSource,
    result: options?.noState ? null : clone(prevAttributes.result),
    page: prevAttributes.page,
    dashboardPage: prevAttributes.dashboardPage,
    dashboardPageSize: prevAttributes.dashboardPageSize,
    lastQuery: options?.noState ? null : prevAttributes.lastQuery,
    lastQueryTime: options?.noState ? null : prevAttributes.lastQueryTime,
    startQueryTime: options?.noState ? null : prevAttributes.startQueryTime,
    isCodeHidden: options?.noState ? false : prevAttributes.isCodeHidden,
    isResultHidden: options?.noState ? false : prevAttributes.isResultHidden,
    editWithAIPrompt: options?.noState
      ? new Y.Text()
      : duplicateYText(prevAttributes.editWithAIPrompt),
    isEditWithAIPromptOpen: options?.noState
      ? false
      : prevAttributes.isEditWithAIPromptOpen,
    aiSuggestions:
      prevAttributes.aiSuggestions && !options?.noState
        ? duplicateYText(prevAttributes.aiSuggestions)
        : null,
    componentId: options?.componentId ?? prevAttributes.componentId,
    configuration: clone(prevAttributes.configuration),
    sort: clone(prevAttributes.sort),
  }

  if (options?.newVariableName) {
    const name = getDataframeName(
      blocks,
      `${nextAttributes.dataframeName.value}`
    )
    nextAttributes.dataframeName.value = name.value
    nextAttributes.dataframeName.newValue = name.newValue
  }

  const yBlock = new Y.XmlElement<SQLBlock>('block')
  for (const [key, value] of Object.entries(nextAttributes)) {
    // @ts-ignore
    yBlock.setAttribute(key, value)
  }

  return yBlock
}

/**
 * Generates a unique dataframe name by appending an incremented index to the provided prefix.
 *
 * This function iterates over the SQL blocks present in the given collection, extracts their
 * existing dataframe names, and ensures that the returned name (in the form of "prefix_index")
 * does not conflict with any names already in use. If the given prefix ends with an underscore
 * followed by a number (e.g., "query_1"), that number is extracted and used as the starting index,
 * and the prefix is trimmed of its numeric suffix.
 *
 * @param blocks - A Yjs map containing the current blocks.
 * @param prefix - The base string for generating the dataframe name. If it ends with "_<number>",
 *                 the numeric part is used as the starting index.
 * @returns An object with "value" and "newValue" properties set to the unique dataframe name.
 */
function getDataframeName(
  blocks: Y.Map<YBlock>,
  prefix: string
): DataframeName {
  const sqlBlocks = Array.from(blocks.values()).filter(isSQLBlock)
  const names = new Set(
    sqlBlocks.map((block) => block.getAttribute('dataframeName')?.value)
  )

  const lastPartStr = prefix.split('_').pop()
  const lastPart = lastPartStr ? parseInt(lastPartStr) : 0
  let i = Number.isNaN(lastPart) ? 1 : lastPart
  if (!Number.isNaN(lastPart)) {
    // remove last _{i} part from prefix
    prefix = prefix.split('_').slice(0, -1).join('_')
  }

  while (names.has(`${prefix}_${i}`)) {
    i++
  }

  return {
    value: `${prefix}_${i}`,
    newValue: `${prefix}_${i}`,
  }
}

/**
 * Determines the execution status of a SQL block.
 *
 * This function checks for the presence of the `lastQueryTime` attribute to decide if the block
 * has been executed. If `lastQueryTime` is not set, or if the block does not have a `result` attribute,
 * the function returns 'idle'. When a `result` is present, it evaluates the `type` property:
 * - Returns 'success' if the type is 'success'.
 * - Returns 'error' if the type is 'abort-error', 'syntax-error', or 'python-error'.
 *
 * @param block - The Y.XmlElement representing the SQL block.
 * @returns The execution status of the SQL block, either 'idle', 'success', or 'error'.
 */
export function getSQLBlockResultStatus(
  block: Y.XmlElement<SQLBlock>
): ResultStatus {
  const lastQueryTime = block.getAttribute('lastQueryTime')
  if (!lastQueryTime) {
    return 'idle'
  }

  const result = block.getAttribute('result')
  if (!result) {
    return 'idle'
  }

  switch (result.type) {
    case 'success':
      return 'success'
    case 'abort-error':
    case 'syntax-error':
    case 'python-error':
      return 'error'
  }
}

export function getSQLSource(block: Y.XmlElement<SQLBlock>): Y.Text {
  return getAttributeOr(block, 'source', new Y.Text(''))
}

export function getSQLAISuggestions(
  block: Y.XmlElement<SQLBlock>
): Y.Text | null {
  return getAttributeOr(block, 'aiSuggestions', null)
}

export function getSQLBlockEditWithAIPrompt(
  block: Y.XmlElement<SQLBlock>
): Y.Text {
  return getAttributeOr(block, 'editWithAIPrompt', new Y.Text(''))
}

export function isSQLBlockEditWithAIPromptOpen(
  block: Y.XmlElement<SQLBlock>
): boolean {
  return getAttributeOr(block, 'isEditWithAIPromptOpen', false)
}

export function toggleSQLEditWithAIPromptOpen(block: Y.XmlElement<SQLBlock>) {
  const operation = () => {
    const isOpen = getAttributeOr(block, 'isEditWithAIPromptOpen', false)
    block.setAttribute('isEditWithAIPromptOpen', !isOpen)
  }

  if (block.doc) {
    block.doc.transact(operation)
  } else {
    operation()
  }
}

export function closeSQLEditWithAIPrompt(
  block: Y.XmlElement<SQLBlock>,
  cleanPrompt: boolean
) {
  const opeartion = () => {
    const prompt = getSQLBlockEditWithAIPrompt(block)
    if (cleanPrompt) {
      prompt.delete(0, prompt.length)
    }

    block.setAttribute('isEditWithAIPromptOpen', false)
  }

  if (block.doc) {
    block.doc.transact(opeartion)
  } else {
    opeartion()
  }
}

export function updateSQLAISuggestions(
  block: Y.XmlElement<SQLBlock>,
  suggestions: string
) {
  const aiSuggestions = getSQLAISuggestions(block)
  if (!aiSuggestions) {
    block.setAttribute('aiSuggestions', new Y.Text(suggestions))
    return
  }

  updateYText(aiSuggestions, suggestions)
}

export function getSQLBlockExecutedAt(
  block: Y.XmlElement<SQLBlock>,
  blocks: Y.Map<YBlock>
): Date | null {
  const lastQueryTime = getSQLAttributes(block, blocks).lastQueryTime?.trim()
  if (!lastQueryTime) {
    return null
  }

  return new Date(lastQueryTime)
}

export function getSQLBlockIsDirty(
  block: Y.XmlElement<SQLBlock>,
  blocks: Y.Map<YBlock>
): boolean {
  const { lastQuery, source } = getSQLAttributes(block, blocks)

  return lastQuery !== source.toString()
}

export function getSQLBlockErrorMessage(
  block: Y.XmlElement<SQLBlock>
): string | null {
  const result = block.getAttribute('result')
  if (!result) {
    return null
  }

  switch (result.type) {
    case 'abort-error':
      return result.message
    case 'syntax-error':
      return result.message
    case 'python-error':
      return `${result.ename} - ${result.evalue}`
    case 'success':
      return null
  }
}
