/**
 * 清理输入文本，去除不必要的空白字符
 * @param input 输入文本
 * @returns 清理后的文本
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''
  input = input.replace(/<[^>]*>/g, '')
  input = input.replace(/[<>'"]/g, '')
  input = input.replace(/[\x00-\x1F\x7F]/g, '')
  return input.trim()
}
