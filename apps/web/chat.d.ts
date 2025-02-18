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
 * Determines whether the provided chat content is a normal chat.
 *
 * This type guard checks if the chat's `type` property is equal to 'normal', thereby confirming
 * that the `IChatContent` object is an `INormalChat`.
 *
 * @param chat - The chat content to evaluate.
 * @returns True if the chat is a normal chat; otherwise, false.
 */
export function isNormalChat(chat: IChatContent): chat is INormalChat {
  return chat.type === 'normal'
}

/**
 * Determines whether the provided chat content is a document chat.
 *
 * This type guard checks if the `type` property of the given chat object is equal to 'document',
 * which confirms that the chat conforms to the `IDocumentChat` interface.
 *
 * @param chat - The chat content object to evaluate.
 * @returns True if the chat content is a document chat; otherwise, false.
 */
export function isDocumentChat(chat: IChatContent): chat is IDocumentChat {
  return chat.type === 'document'
}

/**
 * Determines if the provided block is an InputBlock.
 *
 * This type guard checks whether the block's type property equals 'INPUT', indicating that the block conforms to the InputBlock interface.
 *
 * @param block - The block to verify.
 * @returns True if the block is an InputBlock, false otherwise.
 */
export function isInputBlock(block: IBlock): block is InputBlock {
  return block.type === 'INPUT'
}

/**
 * Type guard to determine if the given block is a DropdownInputBlock.
 *
 * This function checks whether the `type` property of the provided block equals 'DROPDOWN_INPUT',
 * which indicates that the block conforms to the DropdownInputBlock interface.
 *
 * @param block - The block to be checked.
 * @returns True if the block is a DropdownInputBlock, otherwise false.
 */
export function isDropdownInputBlock(block: IBlock): block is DropdownInputBlock {
  return block.type === 'DROPDOWN_INPUT'
}

/**
 * Determines whether the provided block is a DateInputBlock.
 *
 * This type guard checks if a given block's type is 'DATE_INPUT', confirming that it adheres to the DateInputBlock interface.
 *
 * @param block - The block to check.
 * @returns True if the block's type is 'DATE_INPUT', otherwise false.
 */
export function isDateInputBlock(block: IBlock): block is DateInputBlock {
  return block.type === 'DATE_INPUT'
}

/**
 * Checks if the provided block is of type DateTimeInputBlock.
 *
 * This type guard function verifies whether the given block's type property
 * is 'DATE_TIME_INPUT'. If so, the function confirms that the block can be
 * treated as a DateTimeInputBlock.
 *
 * @param block - The block to check.
 * @returns True if the block is a DateTimeInputBlock, otherwise false.
 */
export function isDateTimeInputBlock(block: IBlock): block is DateTimeInputBlock {
  return block.type === 'DATE_TIME_INPUT'
}

/**
 * Determines whether the given block is a RichTextBlock.
 *
 * This type guard verifies if the provided block's type is 'RICH_TEXT',
 * thus confirming it as a RichTextBlock instance.
 *
 * @param block - The block to check.
 * @returns True if the block is a RichTextBlock; otherwise, false.
 */
export function isRichTextBlock(block: IBlock): block is RichTextBlock {
  return block.type === 'RICH_TEXT'
}

/**
 * Determines whether the given block is a Python block.
 *
 * This type guard checks if the provided block has a type of 'PYTHON' and narrows the type
 * accordingly to a PythonBlock.
 *
 * @param block - The block to check
 * @returns True if the block's type is 'PYTHON', otherwise false.
 */
export function isPythonBlock(block: IBlock): block is PythonBlock {
  return block.type === 'PYTHON'
}

/**
 * Determines whether the given block is a SQL block.
 *
 * This type guard checks if the block's type property is 'SQL',
 * confirming that the block adheres to the SQLBlock interface.
 *
 * @param block - The block to evaluate.
 * @returns True if the block is a SQL block, false otherwise.
 */
export function isSQLBlock(block: IBlock): block is SQLBlock {
  return block.type === 'SQL'
}
