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

export function isNormalChat(chat: IChatContent): chat is INormalChat {
  return chat.type === 'normal'
}

export function isDocumentChat(chat: IChatContent): chat is IDocumentChat {
  return chat.type === 'document'
}

export function isInputBlock(block: IBlock): block is InputBlock {
  return block.type === 'INPUT'
}

export function isDropdownInputBlock(block: IBlock): block is DropdownInputBlock {
  return block.type === 'DROPDOWN_INPUT'
}

export function isDateInputBlock(block: IBlock): block is DateInputBlock {
  return block.type === 'DATE_INPUT'
}

export function isDateTimeInputBlock(block: IBlock): block is DateTimeInputBlock {
  return block.type === 'DATE_TIME_INPUT'
}

export function isRichTextBlock(block: IBlock): block is RichTextBlock {
  return block.type === 'RICH_TEXT'
}

export function isPythonBlock(block: IBlock): block is PythonBlock {
  return block.type === 'PYTHON'
}

export function isSQLBlock(block: IBlock): block is SQLBlock {
  return block.type === 'SQL'
}
