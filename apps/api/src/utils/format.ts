import { ErrorCode } from '../constants/errorcode.js'
import { logger } from '../logger.js'

// 错误消息常量
export const ERROR_MESSAGES = {
  GENERAL: '抱歉，操作未能成功，请稍后再试。如果问题持续，请联系我们的支持团队！ 🙏',
  UNRELATED_CONTENT: '抱歉，我目前无法回答与查找数据无关的内容。如果您有查找数据需求，请随时告诉我！'
} as const

/**
 * Sanitizes an input string by removing unwanted HTML tags, control characters, and escaping special characters.
 *
 * This function removes the `<` and `>` characters to eliminate HTML tags, strips out control characters from U+0000 to U+001F and U+007F to U+009F,
 * escapes special characters such as `&`, `"`, and `'` to their corresponding HTML entities, and trims any leading or trailing whitespace.
 *
 * @param input - The input string to sanitize.
 * @returns The cleaned and safely escaped string.
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // 移除HTML标签
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 移除控制字符
    .replace(/&/g, '&amp;') // 转义特殊字符
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim() // 移除首尾空格
}

/**
 * Formats a Date object into a string based on the specified format.
 *
 * The function replaces placeholders in the format string with corresponding parts of the provided date:
 * - `YYYY`: four-digit year
 * - `MM`: two-digit month (01-12)
 * - `DD`: two-digit day (01-31)
 * - `HH`: two-digit hour (00-23)
 * - `mm`: two-digit minutes (00-59)
 * - `ss`: two-digit seconds (00-59)
 *
 * @param date - The Date object to format.
 * @param format - The format string defining the output pattern (default is 'YYYY-MM-DD HH:mm:ss').
 * @returns The formatted date string.
 *
 * @example
 * const date = new Date(2025, 0, 2, 3, 4, 5); // January 2, 2025, 03:04:05
 * console.log(formatDate(date)); // Outputs: '2025-01-02 03:04:05'
 */
export function formatDate(date: Date, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

/**
 * 格式化错误消息。
 *
 * 根据提供的聊天类型 (rag 或 report) 格式化错误消息，并将原始错误信息记录到日志中。
 * 如果传入的 error 为 Error 实例，则记录其 message 和 stack，否则记录 "未知错误"。
 * 生成的错误消息基于预定义的 ERROR_MESSAGES.GENERAL，并以 Markdown 代码块格式输出。
 *
 * 当 chatType 为 "report" 时，返回一个 JSON 字符串，格式为:
 * {
 *   type: "text",
 *   content: <错误消息内容>
 * }
 * 否则，直接返回错误消息内容字符串。
 *
 * @param chatType - 聊天类型，可为 "rag" 或 "report"。在 "report" 模式下，返回 JSON 格式的错误消息。
 * @param error - 捕获到的错误对象。当为 Error 实例时，其 message 和 stack 将被记录；否则，记录 "未知错误"。
 * @returns 格式化后的错误消息字符串，根据不同的聊天类型可能为纯文本或 JSON 格式。
 *
 * @example
 * // 以 'rag' 类型调用，返回 Markdown 格式的错误消息
 * const errorMsg = formatErrorMessage('rag', new Error('示例错误'));
 *
 * @example
 * // 以 'report' 类型调用，返回包含错误消息内容的 JSON 字符串
 * const reportErrorMsg = formatErrorMessage('report', '示例错误');
 */
export function formatErrorMessage(chatType: 'rag' | 'report', error: unknown): string {
  // 记录原始错误信息到日志
  logger().error({
    msg: 'Error details',
    data: {
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
    },
  })

  const baseErrorContent = [
    '```error',
    ERROR_MESSAGES.GENERAL,
    '```'
  ].join('\n');

  if (chatType === 'report') {
    return JSON.stringify({
      type: 'text',
      content: baseErrorContent
    });
  }

  return baseErrorContent;
}

/**
 * Constructs an error response object.
 *
 * This function creates an object representing an error response by combining an error code with a descriptive message.
 * The returned object includes a property for the error code, the error message (as `msg`), and a `data` property set to `null`.
 *
 * @param code - The numerical error code.
 * @param message - A descriptive message providing details about the error.
 * @returns An object with the error `code`, the provided `message` stored as `msg`, and `data` set to `null`.
 */
export function createErrorResponse(code: number, message: string) {
  return {
    code,
    msg: message,
    data: null
  }
}

/**
 * Creates a standardized success response object.
 *
 * Constructs an object that represents a successful operation, including a success code,
 * a descriptive message, and the associated data payload.
 *
 * @typeParam T - The type of the response data.
 * @param data - The data to include in the response.
 * @param message - An optional message describing the success. Defaults to 'success'.
 * @returns An object containing the success code, message, and data.
 */
export function createSuccessResponse<T>(data: T, message: string = 'success') {
  return {
    code: ErrorCode.SUCCESS,
    msg: message,
    data
  }
}

/**
 * Converts a Date object to its ISO string representation.
 *
 * This function calls the built-in toISOString() method on the given Date. If the conversion
 * fails, it logs the error along with the date value using the logger and returns an empty string.
 *
 * @param date - The Date object to be formatted.
 * @returns The ISO formatted string of the date or an empty string in case of an error.
 */
export function formatDateTime(date: Date): string {
  try {
    return date.toISOString()
  } catch (error) {
    logger().error('Date formatting error:', { error, date })
    return ''
  }
}

/**
 * Formats a file size from bytes into a human-readable string with appropriate units.
 *
 * This function converts the provided file size in bytes into a formatted string using one of 
 * the units: B, KB, MB, GB, or TB. The output is rounded to two decimal places. If the input 
 * value is 0, it returns "0 B".
 *
 * @param bytes - The file size in bytes.
 * @returns The formatted file size as a string.
 *
 * @example
 * formatFileSize(1024);
 * // Returns "1.00 KB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
}

/**
 * Formats the time difference between two dates into a human-readable string using Chinese time units.
 *
 * This function calculates the elapsed time between a given start date and an optional end date
 * (defaulting to the current date and time). The result is returned as a formatted string:
 * - If less than 60 seconds, returns the difference in seconds (e.g., "30秒前").
 * - If less than 60 minutes, returns the difference in minutes (e.g., "5分钟前").
 * - If less than 24 hours, returns the difference in hours (e.g., "3小时前").
 * - If less than 30 days, returns the difference in days (e.g., "2天前").
 * - If less than 12 months, returns the difference in months (e.g., "1个月前").
 * - Otherwise, returns the difference in years (e.g., "1年前").
 *
 * @param start - The starting date for calculating the time difference.
 * @param end - The ending date for calculation. Defaults to the current date and time if not provided.
 * @returns A string that describes the time difference using Chinese time units.
 *
 * @example
 * const startTime = new Date(Date.now() - 90 * 1000); // 90 seconds ago
 * console.log(formatTimeDiff(startTime)); // Outputs something like "1分钟前"
 */
export function formatTimeDiff(start: Date, end: Date = new Date()): string {
  const diff = end.getTime() - start.getTime()
  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) return `${seconds}秒前`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}个月前`

  const years = Math.floor(months / 12)
  return `${years}年前`
}

/**
 * Truncates the provided text to a specified maximum length and appends an ellipsis if truncation occurs.
 *
 * If the input text is empty or its length is less than or equal to the maximum length, the original text is returned.
 *
 * @param text - The string to truncate.
 * @param maxLength - The maximum number of characters allowed before truncation.
 * @returns The original text if its length is within the limit; otherwise, a truncated version followed by "..." is returned.
 *
 * @example
 * // Returns "Hello, Wor..."
 * truncateText("Hello, World!", 10);
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Generates a random alphanumeric ID.
 *
 * This function creates a random string consisting of uppercase letters, lowercase letters, and digits.
 * The length of the generated ID is determined by the provided parameter, with a default value of 32 characters.
 *
 * @param length - The desired length of the random ID. Defaults to 32.
 * @returns A randomly generated string of the specified length.
 */
export function generateRandomId(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Formats a URL string.
 *
 * This function attempts to convert the provided URL string into a standardized URL format by creating a URL object.
 * If the URL is valid, the function returns its normalized string representation. In the case of an invalid URL,
 * an error is logged and the original URL string is returned.
 *
 * @param url - The URL string to format.
 * @returns The formatted URL string if valid; otherwise, the original URL string.
 */
export function formatUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.toString()
  } catch (error) {
    logger().error('URL formatting error:', { error, url })
    return url
  }
}

/**
 * 根据输入的错误值返回一个格式化后的错误消息字符串。
 *
 * 如果输入的错误是一个 Error 实例，则返回其 message 属性；如果是字符串，则直接返回该字符串；
 * 否则返回默认的 "未知错误" 消息。
 *
 * @param error - 可能为 Error 对象、字符串或其他类型的错误值
 * @returns 格式化后的错误消息字符串
 */
export function formatErrorMessageNew(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return '未知错误'
}

/**
 * Formats pagination data into a structured response object.
 *
 * This function takes an array of items and pagination parameters, then returns an object that includes the list of items and detailed pagination information, including the total number of pages calculated as the ceiling of total items divided by the page size.
 *
 * @param data - The array of items for the current page.
 * @param total - The total number of items available.
 * @param page - The current page number.
 * @param pageSize - The number of items per page.
 * @returns An object containing the list of items and a pagination object with details about total items, current page, page size, and total pages.
 */
export function formatPaginationData<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    list: data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

/**
 * Formats a standardized response object.
 *
 * @param code - The numeric response status code.
 * @param msg - A descriptive message for the response.
 * @param data - Optional payload data; defaults to null.
 * @returns An object containing the response code, message, and data.
 *
 * @example
 * const response = formatResponse(200, "Success", { userId: 123 });
 * // Returns: { code: 200, msg: "Success", data: { userId: 123 } }
 */
export function formatResponse(code: number, msg: string, data: any = null) {
  return {
    code,
    msg,
    data,
  }
}

/**
 * Formats an object of query parameters into a URL-encoded string.
 *
 * This function iterates over each key-value pair in the provided object and appends it to a
 * URLSearchParams instance if the value is neither undefined nor null. Each value is converted
 * to a string before appending. The resulting URL-encoded string can be used as a query string 
 * for HTTP requests.
 *
 * @param params - An object where each key represents a query parameter and its value is the corresponding value.
 * @returns A URL-encoded string representing the query parameters.
 */
export function formatQueryParams(params: Record<string, any>): string {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value))
    }
  })

  return searchParams.toString()
}

/**
 * Escapes the provided HTML string by converting special characters into their corresponding HTML entities.
 *
 * This function creates a temporary DOM element, sets its text content to the given HTML string, 
 * and then retrieves the escaped version of that string using the element's innerHTML property.
 *
 * @param html - The HTML string to escape.
 * @returns The escaped HTML string.
 *
 * @example
 * const safeHtml = escapeHtml('<div>Example</div>');
 * // safeHtml: "&lt;div&gt;Example&lt;/div&gt;"
 */
export function escapeHtml(html: string): string {
  const div = document.createElement('div')
  div.textContent = html
  return div.innerHTML
}

/**
 * Formats a file name by converting it to lowercase and replacing non-alphanumeric characters with hyphens.
 *
 * This function converts the provided file name to lowercase, replaces characters that are not letters or digits with hyphens,
 * condenses multiple consecutive hyphens into a single hyphen, and removes any leading or trailing hyphens.
 *
 * @param fileName - The file name to be formatted.
 * @returns The formatted file name.
 *
 * @example
 * // returns "example-file-name"
 * formatFileName("Example File_Name!");
 */
export function formatFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Formats a phone number string into the pattern XXX-XXXX-XXXX.
 *
 * This function assumes the input is a string of digits (typically 11 digits).
 * It inserts hyphens to make the phone number more human-readable. If the input is empty,
 * the function returns an empty string.
 *
 * @param phone - The phone number as a string of digits.
 * @returns The formatted phone number in the form "XXX-XXXX-XXXX", or an empty string if the input is falsy.
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return ''
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
}

/**
 * Formats a numeric amount as a currency string in Chinese Yuan (CNY) style.
 *
 * This function leverages the built-in `Intl.NumberFormat` API with the 'zh-CN' locale
 * to convert the provided amount into a currency-formatted string that includes the
 * appropriate currency symbol, thousand separators, and decimal formatting according to Chinese conventions.
 *
 * @param amount - The numeric amount to be formatted.
 * @returns A string representing the formatted currency (e.g., "￥1,234.56").
 *
 * @example
 * ```
 * formatCurrency(1234.56); // returns "￥1,234.56"
 * ```
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount)
}

/**
 * Formats a number using the Chinese locale ('zh-CN').
 *
 * This function leverages JavaScript's Intl.NumberFormat to format the given number
 * according to the conventions of the Chinese locale.
 *
 * @param num - The number to be formatted.
 * @returns The formatted number as a string.
 *
 * @example
 * const result = formatNumber(1234567.89);
 * console.log(result); // Expected output: "1,234,567.89" (format may vary based on locale settings)
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num)
}

/**
 * Formats a decimal number as a percentage string.
 *
 * This function converts a provided decimal value into a percentage by multiplying it by 100,
 * rounding it to two decimal places, and appending the '%' symbol.
 *
 * @param value - The decimal value to format (e.g., 0.25 represents 25.00%).
 * @returns The formatted percentage string.
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

/**
 * Formats a timestamp into an ISO 8601 formatted string.
 *
 * Converts the provided timestamp (in milliseconds since the Unix epoch) into its ISO 8601
 * string representation using the built-in Date.toISOString() method.
 *
 * @param timestamp - The timestamp in milliseconds.
 * @returns The ISO 8601 formatted date string.
 *
 * @throws RangeError If the provided timestamp results in an invalid date.
 *
 * @example
 * ```
 * const isoDate = formatTimestamp(1609459200000);
 * console.log(isoDate); // "2021-01-01T00:00:00.000Z"
 * ```
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * Formats the provided data into a prettified JSON string.
 *
 * This function attempts to convert the input data into a JSON string with 2-space indentation.
 * If the conversion fails (for example, due to circular references), the error is logged
 * and an empty string is returned.
 *
 * @param data - The data to be formatted as JSON.
 * @returns The formatted JSON string, or an empty string if formatting fails.
 */
export function formatJSON(data: any): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch (error) {
    logger().error('JSON formatting error:', { error, data })
    return ''
  }
}

/**
 * Encodes the provided string into Base64 format.
 *
 * This function converts the input string to its Base64 representation using Node.js Buffer.
 * If an error occurs during the encoding process, the error is logged and an empty string is returned.
 *
 * @param str - The string to encode.
 * @returns The Base64 encoded string, or an empty string if encoding fails.
 */
export function formatBase64(str: string): string {
  try {
    return Buffer.from(str).toString('base64')
  } catch (error) {
    logger().error('Base64 encoding error:', { error, str })
    return ''
  }
}

/**
 * Decodes a Base64 encoded string.
 *
 * This function attempts to decode the provided Base64 string using Node.js Buffer. If an error occurs during
 * decoding, the error is logged and an empty string is returned.
 *
 * @param base64 - The Base64 encoded string to decode.
 * @returns The decoded string, or an empty string if the decoding process fails.
 */
export function decodeBase64(base64: string): string {
  try {
    return Buffer.from(base64, 'base64').toString()
  } catch (error) {
    logger().error('Base64 decoding error:', { error, base64 })
    return ''
  }
}
