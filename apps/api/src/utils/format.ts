import { ErrorCode } from '../constants/errorcode.js'
import { logger } from '../logger.js'

// 错误消息常量
export const ERROR_MESSAGES = {
  GENERAL: '抱歉，操作未能成功，请稍后再试。如果问题持续，请联系我们的支持团队！ 🙏',
  UNRELATED_CONTENT: '抱歉，我目前无法回答与查找数据无关的内容。如果您有查找数据需求，请随时告诉我！'
} as const

/**
 * Sanitizes an input string by removing HTML tags, control characters, and escaping special characters.
 *
 * This function performs the following transformations:
 * - Removes angle brackets ("<" and ">") to prevent HTML tag injection.
 * - Strips control characters (Unicode ranges U+0000-U+001F and U+007F-U+009F).
 * - Escapes ampersands (&), double quotes ("), and single quotes (') to their corresponding HTML entities.
 * - Trims leading and trailing whitespace.
 *
 * @param input - The string to be sanitized.
 * @returns The sanitized string.
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
 * Formats a Date object into a string based on the provided format pattern.
 *
 * This function replaces the following tokens in the format string with their corresponding
 * date components:
 * - "YYYY": 4-digit year
 * - "MM": 2-digit month (01-12)
 * - "DD": 2-digit day of the month (01-31)
 * - "HH": 2-digit hour in 24-hour format (00-23)
 * - "mm": 2-digit minutes (00-59)
 * - "ss": 2-digit seconds (00-59)
 *
 * @param date - The Date object to format.
 * @param format - The format string specifying the output format. Defaults to 'YYYY-MM-DD HH:mm:ss'.
 * @returns A string representing the formatted date.
 *
 * @example
 * const date = new Date('2025-02-15T13:05:45');
 * console.log(formatDate(date)); // '2025-02-15 13:05:45'
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
 * Formats an error message for chat responses.
 *
 * This function logs the original error details, then creates a formatted error message wrapped
 * in a markdown-like error block. If the provided `chatType` is 'report', the function returns a JSON
 * string containing a text type and the formatted error message. Otherwise (for 'rag'), it returns
 * the formatted error message directly.
 *
 * @param chatType - The type of chat context, either 'rag' for regular messages or 'report' for report messages.
 * @param error - The error to be formatted. Can be an Error object or any other type.
 * @returns A string with the formatted error message, either as a JSON string (for 'report') or a text block.
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
 * Creates an error response object.
 *
 * Constructs a standardized error response object using the provided error code and message.
 *
 * @param code - The error code representing the type of error.
 * @param message - A descriptive error message.
 * @returns An object with the error code, the error message under the key `msg`, and `data` set to null.
 *
 * @example
 * const response = createErrorResponse(400, 'Bad Request');
 * // response === { code: 400, msg: 'Bad Request', data: null }
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
 * This function returns an object that includes a success code, a message,
 * and the provided data payload. It uses the predefined constant `ErrorCode.SUCCESS`
 * to indicate that the operation completed successfully.
 *
 * @param data - The payload to include in the response.
 * @param message - The success message to include, defaults to 'success'.
 * @returns An object with `code`, `msg`, and `data` properties representing the success response.
 */
export function createSuccessResponse<T>(data: T, message: string = 'success') {
  return {
    code: ErrorCode.SUCCESS,
    msg: message,
    data
  }
}

/**
 * Formats a Date object into an ISO string.
 *
 * This function converts the provided Date object into its ISO 8601 string representation. If an error occurs during formatting,
 * the error is logged and an empty string is returned.
 *
 * @param date - The Date object to format.
 * @returns The ISO-formatted date string, or an empty string if formatting fails.
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
 * Formats a file size (in bytes) into a human-readable string with appropriate units.
 *
 * This function converts the given number of bytes into a more readable format by determining
 * the appropriate unit (B, KB, MB, GB, TB) using logarithmic calculations with a base of 1024.
 * The resulting value is rounded to two decimal places. If the input is 0, it returns "0 B".
 *
 * @param bytes - The file size in bytes.
 * @returns The formatted file size as a string with the corresponding unit.
 *
 * @example
 * // Returns "1.00 KB"
 * formatFileSize(1024);
 *
 * @example
 * // Returns "1023.00 B"
 * formatFileSize(1023);
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
}

/**
 * 计算两个日期之间的时间差，并返回格式化后的中文描述字符串。
 *
 * 该函数基于两个日期的毫秒级差值，将时间差转换为最合适的时间单位：
 * - 小于 60 秒返回 "X秒前"
 * - 小于 60 分钟返回 "X分钟前"
 * - 小于 24 小时返回 "X小时前"
 * - 小于 30 天返回 "X天前"
 * - 小于 12 个月返回 "X个月前"
 * - 超过 12 个月返回 "X年前"
 *
 * @param start - 起始时间
 * @param end - 结束时间（默认值为当前时间）
 * @returns 格式化后的时间差描述字符串
 *
 * @example
 * // 假设当前时间为 2025-02-01 12:00:00
 * // 输出 "2分钟前"
 * console.log(formatTimeDiff(new Date('2025-02-01T11:58:00')));
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
 * Truncates a string to a specified maximum length, appending an ellipsis ("...") if truncation occurs.
 *
 * If the text is empty or its length is less than or equal to the specified maximum, the original text is returned.
 *
 * @param text - The input string to truncate.
 * @param maxLength - The maximum number of characters allowed before truncation.
 * @returns The original string if its length is less than or equal to maxLength; otherwise, a truncated string ending with an ellipsis.
 *
 * @example
 * // Returns "Hello..."
 * truncateText("Hello, world!", 5);
 *
 * @example
 * // Returns "Hi"
 * truncateText("Hi", 5);
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Generates a random alphanumeric string.
 *
 * This function creates a random identifier consisting of uppercase letters, lowercase letters, and digits.
 * The default string length is 32 characters if no specific length is provided.
 *
 * @param length - The desired length of the random identifier (default is 32).
 * @returns A randomly generated alphanumeric string of the specified length.
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
 * Attempts to format a URL string by parsing it with the URL constructor.
 *
 * If the input string represents a valid URL, the function returns its normalized string format.
 * Should the parsing fail, an error is logged via the logger and the original string is returned.
 *
 * @param url - The URL string to format.
 * @returns The formatted URL string if valid, or the original string if parsing fails.
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
 * 格式化错误消息。
 *
 * 根据传入的错误信息类型，此函数返回适当的错误消息字符串：
 * - 如果错误是 `Error` 实例，则返回该实例的 `message` 属性；
 * - 如果错误是字符串，则直接返回该字符串；
 * - 否则返回固定的 "未知错误"。
 *
 * @param error - 待格式化的错误信息，可能是一个 `Error` 实例、字符串或其他类型
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
 * This function organizes an array of items along with pagination information into
 * a consistent object format. The returned object includes:
 *   - `list`: The original data items.
 *   - `pagination`: An object containing pagination details:
 *       - `total`: The total number of items.
 *       - `page`: The current page number.
 *       - `pageSize`: The number of items per page.
 *       - `totalPages`: The total number of pages, calculated as Math.ceil(total / pageSize).
 *
 * @param data - The array of data items.
 * @param total - The total number of items.
 * @param page - The current page number.
 * @param pageSize - The number of items per page.
 * @returns An object containing the list of items and the corresponding pagination details.
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
 * This function constructs an object containing a response code, a message, and an optional data payload.
 * It is used to ensure a consistent format for API responses.
 *
 * @param code - The status code representing the outcome of an operation.
 * @param msg - A descriptive message providing additional details about the result.
 * @param data - Optional payload containing additional response data; defaults to null.
 * @returns An object containing the properties: code, msg, and data.
 */
export function formatResponse(code: number, msg: string, data: any = null) {
  return {
    code,
    msg,
    data,
  }
}

/**
 * Formats an object of query parameters into a URL-encoded query string.
 *
 * This function iterates over the key-value pairs in the provided object and appends them to a new URLSearchParams instance.
 * Only parameters with defined and non-null values are included in the resulting query string.
 *
 * @param params - An object containing query parameter key-value pairs.
 * @returns The URL-encoded query string representation of the parameters.
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
 * Escapes HTML special characters in a given string.
 *
 * This function creates a temporary DOM element, assigns the input string to its text
 * content, and then retrieves the innerHTML. This process converts special characters
 * (such as '<', '>', '&', etc.) into their corresponding HTML entities, ensuring the
 * string is safe for insertion into HTML.
 *
 * @param html - The string to be escaped.
 * @returns The escaped HTML string with all special characters replaced by HTML entities.
 */
export function escapeHtml(html: string): string {
  const div = document.createElement('div')
  div.textContent = html
  return div.innerHTML
}

/**
 * Formats a file name to be URL-friendly.
 *
 * This function converts the input file name to lowercase, replaces all
 * non-alphanumeric characters with hyphens, condenses multiple hyphens into
 * a single hyphen, and removes any leading or trailing hyphens.
 *
 * @param fileName - The original file name.
 * @returns The formatted file name.
 */
export function formatFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Formats a phone number by inserting hyphens in the pattern "XXX-XXXX-XXXX".
 *
 * This function expects a phone number string typically consisting of 11 digits and uses a regular expression
 * to insert hyphens between the appropriate digit groups. If the input is falsy (e.g., an empty string), it returns an empty string.
 *
 * @param phone - The phone number string to be formatted.
 * @returns The formatted phone number with hyphens, or an empty string if the input is falsy.
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return ''
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
}

/**
 * Formats a number as a currency string in Chinese Yuan (CNY).
 *
 * This function uses the Intl.NumberFormat API with the 'zh-CN' locale to format the provided
 * numerical amount as currency in CNY, ensuring that monetary values are displayed in a standardized
 * locale-specific format.
 *
 * @param amount - The monetary value to format.
 * @returns The formatted currency string, for example "￥1,234.56".
 *
 * @example
 * const result = formatCurrency(1234.56);
 * console.log(result); // "￥1,234.56"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount)
}

/**
 * Formats a number into a string according to Chinese locale conventions.
 *
 * This function leverages the Intl.NumberFormat API with the 'zh-CN' locale to format
 * numeric values with appropriate digit grouping and locale-specific formatting.
 *
 * @param num - The number to format.
 * @returns The formatted number as a string.
 *
 * @example
 * ```
 * const result = formatNumber(1234567);
 * // result: "1,234,567"
 * ```
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num)
}

/**
 * Formats a number as a percentage string.
 *
 * This function multiplies the given numerical value by 100, formats it to two decimal places,
 * and appends a '%' symbol to produce a percentage representation.
 *
 * @param value - The numerical value to format as a percentage. For example, 0.1234 becomes "12.34%".
 * @returns The formatted percentage string.
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

/**
 * Formats a timestamp as an ISO 8601 string.
 *
 * This function converts a numerical timestamp (in milliseconds since Unix epoch) into its ISO 8601 string representation.
 *
 * @param timestamp - The timestamp in milliseconds since Unix epoch.
 * @returns A string representing the date in ISO 8601 format.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * Converts the input data to a pretty-printed JSON string.
 *
 * This function attempts to format the provided data using JSON.stringify with an indentation
 * of 2 spaces. If the data cannot be converted (for example, due to circular references), the
 * error is logged and an empty string is returned.
 *
 * @param data - The data to be formatted as JSON
 * @returns A formatted JSON string if successful; otherwise, an empty string
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
 * This function uses Node.js Buffer to convert the input string to its Base64-encoded representation.
 * If an error occurs during encoding, the error is logged and an empty string is returned.
 *
 * @param str - The input string to encode.
 * @returns The Base64 encoded string, or an empty string if an encoding error occurs.
 *
 * @example
 * ```typescript
 * const encoded = formatBase64("Hello, World!");
 * console.log(encoded); // Outputs: "SGVsbG8sIFdvcmxkIQ=="
 * ```
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
 * Decodes a Base64-encoded string.
 *
 * This function converts the provided Base64 string into a decoded string using
 * Node.js's Buffer functionality. In case of a decoding error, it logs the error
 * and returns an empty string.
 *
 * @param base64 - The Base64 encoded string to decode.
 * @returns The decoded string, or an empty string if an error occurs during decoding.
 */
export function decodeBase64(base64: string): string {
  try {
    return Buffer.from(base64, 'base64').toString()
  } catch (error) {
    logger().error('Base64 decoding error:', { error, base64 })
    return ''
  }
}
