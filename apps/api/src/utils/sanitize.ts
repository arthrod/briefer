/**
 * 清理输入文本，移除 HTML 标签、不需要的特殊字符及控制字符，并修剪首尾空白。
 *
 * 此函数首先检查输入是否为 falsy（例如空字符串或 null），若是则返回空字符串。否则，
 * 它会进行以下处理：
 * - 使用正则表达式 /<[^>]*>/g 移除所有 HTML 标签；
 * - 使用正则表达式 /[<>'"]/g 移除字符 <、>、' 和 "；
 * - 使用正则表达式 /[\x00-\x1F\x7F]/g 移除所有 ASCII 控制字符（0-31 和 127）。
 *
 * 处理完成后，对字符串应用 trim() 方法以移除首尾空白字符，并返回清理后的结果。
 *
 * @param input 输入的文本字符串
 * @returns 清理并修剪后的文本字符串
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''
  input = input.replace(/<[^>]*>/g, '')
  input = input.replace(/[<>'"]/g, '')
  input = input.replace(/[\x00-\x1F\x7F]/g, '')
  return input.trim()
}
