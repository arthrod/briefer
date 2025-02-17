/**
 * 清理输入文本，移除不安全或不必要的字符和空白字符。
 *
 * 此函数用于移除输入文本中的 HTML 标签、特定特殊字符以及 ASCII 控制字符，并去除首尾空白空格。
 * 如果输入为 falsy 值（如 null、undefined 或空字符串），则直接返回空字符串。
 *
 * 清理步骤：
 * 1. 移除所有 HTML 标签（匹配 `<` 与 `>` 之间的内容）。
 * 2. 移除 `<`、`>`、`'` 和 `"` 字符。
 * 3. 移除 ASCII 控制字符（范围 0-31 以及 127）。
 * 4. 去除字符串两端的空白字符。
 *
 * @param input - 要清理的输入文本
 * @returns 清理后的文本字符串
 *
 * @example
 * // 返回: "Hello World"
 * sanitizeInput("<div>Hello <span>World</span></div>")
 */
export function sanitizeInput(input: string): string {
  if (!input) return ''
  input = input.replace(/<[^>]*>/g, '')
  input = input.replace(/[<>'"]/g, '')
  input = input.replace(/[\x00-\x1F\x7F]/g, '')
  return input.trim()
}
