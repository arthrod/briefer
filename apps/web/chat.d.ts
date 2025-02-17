export type ChatType = 'rag' | 'report' | ''

export interface IBaseChat {
  id: string
  createdTime: string
  type: ChatType
}

export type IChatContent = INormalChat | IDocumentChat

export interface INormalChat extends IBaseChat {
  content: string
}

type ChatBlockType =
  | 'RICH_TEXT'
  | 'SQL'
  | 'PYTHON'
  | 'INPUT'
  | 'DROPDOWN_INPUT'
  | 'DATE_INPUT'
  | 'DATE_TIME_INPUT'

export interface IBaseBlock {
  type: ChatBlockType
}

export interface InputBlock extends IBaseBlock {
  variable: string
  label: string
}

export interface DropdownItem {
  label: string
  value: string | number
}

export interface DropdownInputBlock extends IBaseBlock {
  variable: string
  label: string
  options: DropdownItem[]
}

export interface DateInputBlock extends IBaseBlock {
  variable: string
  label: string
}

export interface DateTimeInputBlock extends IBaseBlock {
  variable: string
  label: string
}

export interface RichTextBlock extends IBaseBlock {
  content: string
  variables?: string[]
}

export interface PythonBlock extends IBaseBlock {
  content: string
}

export interface SQLBlock extends IBaseBlock {
  content: string
  variable: string
  tables: string[]
}

export type IBlock =
  | InputBlock
  | DropdownInputBlock
  | DateInputBlock
  | DateTimeInputBlock
  | RichTextBlock
  | PythonBlock
  | SQLBlock

export interface IDocumentChat extends IBaseChat {
  block: IBlock // 块类型
}

/**
 * Checks whether the provided chat content is a normal chat.
 *
 * This type guard function verifies that the given chat object has its `type` property set to 'normal',
 * indicating that it conforms to the `INormalChat` interface.
 *
 * @param chat - The chat content to check.
 * @returns True if the chat is a normal chat; otherwise, false.
 */
export function isNormalChat(chat: IChatContent): chat is INormalChat {
  return chat.type === 'normal'
}

/**
 * Type guard to check if the provided chat content is a document chat.
 *
 * This function verifies that the `type` property of the chat object is equal to "document",
 * confirming that it conforms to the IDocumentChat interface.
 *
 * @param chat - The chat content to be evaluated.
 * @returns True if the chat is a document chat, false otherwise.
 */
export function isDocumentChat(chat: IChatContent): chat is IDocumentChat {
  return chat.type === 'document'
}

/**
 * Determines whether the provided block is an InputBlock.
 *
 * This function checks if the `type` property of the given block is equal to 'INPUT', thereby
 * identifying it as an InputBlock.
 *
 * @param block - The block to evaluate.
 * @returns True if the block's type is 'INPUT', indicating it is an InputBlock; otherwise, false.
 */
export function isInputBlock(block: IBlock): block is InputBlock {
  return block.type === 'INPUT'
}

/**
 * Type guard that checks if the provided block is a DropdownInputBlock.
 *
 * This function verifies whether the block's `type` property equals 'DROPDOWN_INPUT', which indicates
 * that the block conforms to the DropdownInputBlock interface.
 *
 * @param block - The block to check.
 * @returns True if the block is a DropdownInputBlock, false otherwise.
 */
export function isDropdownInputBlock(block: IBlock): block is DropdownInputBlock {
  return block.type === 'DROPDOWN_INPUT'
}

/**
 * Determines whether the provided block is a DateInputBlock.
 *
 * This type guard checks if the block's type property is equal to 'DATE_INPUT'.
 * If so, it confirms that the block is a DateInputBlock.
 *
 * @param block - The block to examine.
 * @returns True if the block is a DateInputBlock, otherwise false.
 */
export function isDateInputBlock(block: IBlock): block is DateInputBlock {
  return block.type === 'DATE_INPUT'
}

/**
 * Determines whether the provided block is a DateTimeInputBlock.
 *
 * This function checks if the block's type property is equal to 'DATE_TIME_INPUT',
 * indicating that it conforms to the DateTimeInputBlock interface.
 *
 * @param block - The block to verify.
 * @returns True if the block is a DateTimeInputBlock; otherwise, false.
 */
export function isDateTimeInputBlock(block: IBlock): block is DateTimeInputBlock {
  return block.type === 'DATE_TIME_INPUT'
}

/**
 * Checks whether the given block is a RichTextBlock.
 *
 * This type guard function verifies if the block's type property is 'RICH_TEXT',
 * thereby determining if the block should be treated as a RichTextBlock.
 *
 * @param block - The block object to be evaluated.
 * @returns True if the block is a RichTextBlock; otherwise, false.
 */
export function isRichTextBlock(block: IBlock): block is RichTextBlock {
  return block.type === 'RICH_TEXT'
}

/**
 * Determines if a given block is a Python block.
 *
 * This type guard checks whether the provided block's type is 'PYTHON',
 * indicating that it conforms to the PythonBlock interface.
 *
 * @param block - The block to test against the PythonBlock type.
 * @returns True if the block is a PythonBlock, false otherwise.
 */
export function isPythonBlock(block: IBlock): block is PythonBlock {
  return block.type === 'PYTHON'
}

/**
 * Determines whether the specified block is a SQL block.
 *
 * This type guard verifies if the block's type property is equal to 'SQL', thereby confirming that it conforms to the SQLBlock interface.
 *
 * @param block - The block to check.
 * @returns True if the block is a SQL block; otherwise, false.
 */
export function isSQLBlock(block: IBlock): block is SQLBlock {
  return block.type === 'SQL'
}
