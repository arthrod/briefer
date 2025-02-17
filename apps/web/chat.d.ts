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
 * Determines whether a given chat object is a normal chat.
 *
 * This type guard checks if the provided chat's `type` property equals `'normal'`.
 * When true, TypeScript narrows the chat object to `INormalChat`, allowing access
 * to properties specific to normal chats.
 *
 * @param chat - The chat object to evaluate, which can be either a normal chat or a document chat.
 * @returns `true` if the chat is a normal chat; otherwise, `false`.
 */
export function isNormalChat(chat: IChatContent): chat is INormalChat {
  return chat.type === 'normal'
}

/**
 * Determines if the provided chat content is a document chat.
 *
 * This function serves as a type guard, checking whether the `type` property of the chat
 * content is equal to 'document'. If so, the function refines the type to `IDocumentChat`.
 *
 * @param chat - The chat content object to check, which can be either a normal or a document chat.
 * @returns True if the chat content is a document chat, otherwise false.
 */
export function isDocumentChat(chat: IChatContent): chat is IDocumentChat {
  return chat.type === 'document'
}

/**
 * Determines whether the provided block is an InputBlock.
 *
 * @param block - The block to check.
 * @returns True if the block's type is 'INPUT', indicating it is an InputBlock; otherwise, false.
 */
export function isInputBlock(block: IBlock): block is InputBlock {
  return block.type === 'INPUT'
}

/**
 * Determines whether the provided block is a DropdownInputBlock.
 *
 * This type guard checks if the block's `type` property is equal to 'DROPDOWN_INPUT',
 * indicating that the block conforms to the DropdownInputBlock interface.
 *
 * @param block - The block to check.
 * @returns True if the block is a DropdownInputBlock; otherwise, false.
 */
export function isDropdownInputBlock(block: IBlock): block is DropdownInputBlock {
  return block.type === 'DROPDOWN_INPUT'
}

/**
 * Determines whether the provided block is a DateInputBlock.
 *
 * This type guard checks if the block's `type` property is equal to 'DATE_INPUT', effectively
 * confirming that the block conforms to the DateInputBlock interface.
 *
 * @param block - The block to evaluate.
 * @returns True if the block is a DateInputBlock, false otherwise.
 *
 * @example
 * const block: IBlock = { type: 'DATE_INPUT', /* additional properties */ };
 * if (isDateInputBlock(block)) {
 *   // Now block is typed as DateInputBlock
 * }
 */
export function isDateInputBlock(block: IBlock): block is DateInputBlock {
  return block.type === 'DATE_INPUT'
}

/**
 * Type guard to determine if a block is a DateTimeInputBlock.
 *
 * This function verifies that the provided block's type is 'DATE_TIME_INPUT', indicating
 * that it conforms to the DateTimeInputBlock interface.
 *
 * @param block - The block to check.
 * @returns True if the block is a DateTimeInputBlock, false otherwise.
 */
export function isDateTimeInputBlock(block: IBlock): block is DateTimeInputBlock {
  return block.type === 'DATE_TIME_INPUT'
}

/**
 * Type guard that checks if a given block is a RichTextBlock.
 *
 * This function inspects the `type` property of the block and returns true if it equals `'RICH_TEXT'`,
 * indicating that the block conforms to the RichTextBlock interface.
 *
 * @param block - The block to evaluate.
 * @returns True if the block is a RichTextBlock; otherwise, false.
 *
 * @example
 * if (isRichTextBlock(block)) {
 *   // Now you can safely access RichTextBlock-specific properties.
 * }
 */
export function isRichTextBlock(block: IBlock): block is RichTextBlock {
  return block.type === 'RICH_TEXT'
}

/**
 * Determines if a given block is a PythonBlock.
 *
 * This type guard checks whether the `type` property of the provided block equals 'PYTHON',
 * confirming that the block adheres to the PythonBlock interface.
 *
 * @param block - The block to evaluate.
 * @returns True if the block is a PythonBlock, false otherwise.
 */
export function isPythonBlock(block: IBlock): block is PythonBlock {
  return block.type === 'PYTHON'
}

/**
 * Checks whether the provided block is an SQLBlock.
 *
 * This type guard verifies that the given block's `type` property is equal to 'SQL',
 * thereby confirming that it conforms to the SQLBlock interface.
 *
 * @param block - The block to be checked.
 * @returns True if the block is an SQLBlock, false otherwise.
 */
export function isSQLBlock(block: IBlock): block is SQLBlock {
  return block.type === 'SQL'
}
