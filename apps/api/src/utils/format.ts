import { ErrorCode } from '../constants/errorcode.js'
import { logger } from '../logger.js'

// 错误消息常量
export const ERROR_MESSAGES = {
  GENERAL: '抱歉，操作未能成功，请稍后再试。如果问题持续，请联系我们的支持团队！ 🙏',
  UNRELATED_CONTENT: '抱歉，我目前无法回答与查找数据无关的内容。如果您有查找数据需求，请随时告诉我！'
} as const

/**
 * Sanitizes the input string by removing HTML tag markers, control characters, escaping special HTML characters, and trimming whitespace.
 *
 * This function processes the input string by:
 * - Removing `<` and `>` characters.
 * - Removing control characters in the Unicode ranges \u0000-\u001F and \u007F-\u009F.
 * - Escaping special characters: replacing `&` with `&amp;`, `"` with `&quot;`, and `'` with `&#39;`.
 * - Trimming leading and trailing whitespace.
 *
 * @param input - The input string to be sanitized.
 * @returns The sanitized string.
 *
 * @example
 * // Returns: Hello &amp; World
 * sanitizeInput('<Hello & World>');
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
 * Formats a Date object into a string based on a specified format.
 *
 * This function extracts the year, month, day, hours, minutes, and seconds from the provided Date object
 * and replaces the corresponding placeholders in the format string. Supported placeholders include:
 * - 'YYYY': four-digit year
 * - 'MM': two-digit month (padded with zeros if necessary)
 * - 'DD': two-digit day (padded with zeros if necessary)
 * - 'HH': two-digit hours in 24-hour format (padded with zeros if necessary)
 * - 'mm': two-digit minutes (padded with zeros if necessary)
 * - 'ss': two-digit seconds (padded with zeros if necessary)
 *
 * @param date - The Date object to format.
 * @param format - A string that specifies the format pattern. Defaults to 'YYYY-MM-DD HH:mm:ss'.
 * @returns The date formatted as a string.
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
 * Formats an error message for a given chat context.
 *
 * This function logs the full error details and constructs a formatted error message using a base template.
 * If the provided chat type is "report", it returns a JSON string containing a text message with the error details;
 * otherwise, for "rag", it returns a plain text error message formatted as a code block.
 * In the logging step, if the error is an instance of Error, its message and stack trace are used,
 * otherwise, a default "未知错误" message is recorded.
 *
 * @param chatType - The chat type, where 'rag' returns a plain text message and 'report' returns a JSON-formatted string.
 * @param error - The error to be formatted; if it's an instance of Error, its message and stack are utilized, otherwise a default message is used.
 * @returns The formatted error message as a string, either as plain text or in JSON format depending on the chat type.
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
 * Creates a standardized error response object.
 *
 * @param code - The error code representing the type of error.
 * @param message - A descriptive error message.
 * @returns An object with the error code, the message under the `msg` key, and `data` set to null.
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
 * This function constructs and returns an object representing a successful operation.
 * The response object includes a success code from `ErrorCode.SUCCESS`, a message, and
 * the data payload provided.
 *
 * @param data - The data payload to be returned.
 * @param message - An optional success message (default is "success").
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
 * Formats a Date object into an ISO 8601 string.
 *
 * This function attempts to convert the provided Date object into its ISO 8601 string representation.
 * If an error occurs during the conversion, it logs the error and returns an empty string.
 *
 * @param date - The Date object to format.
 * @returns The ISO 8601 string representation of the date, or an empty string if an error occurs.
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
 * Formats a file size in bytes into a human-readable string.
 *
 * This function converts a numeric value representing bytes into a string with an appropriate unit (B, KB, MB, GB, or TB).
 * The conversion is done using a factor of 1024, and the result is formatted to two decimal places.
 * If the input is zero, it returns "0 B".
 *
 * @param bytes - The file size in bytes.
 * @returns The formatted file size as a string with its corresponding unit.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
}

/**
 * 计算两个日期之间的时间差，并以中文描述返回相对时间字符串。
 *
 * 该函数根据开始时间 `start` 和结束时间 `end` 之间的差值，返回不同时间单位的描述：
 * - 当差值小于 60 秒时，返回秒数，如 "30秒前"；
 * - 当差值小于 60 分钟时，返回分钟数，如 "5分钟前"；
 * - 当差值小于 24 小时时，返回小时数，如 "2小时前"；
 * - 当差值小于 30 天时，返回天数，如 "10天前"；
 * - 当差值小于 12 个月时，返回月份，如 "3个月前"；
 * - 否则返回年份，如 "1年前"。
 *
 * @param start - 开始日期对象
 * @param end - 结束日期对象，默认为当前时间
 * @returns 时间差的中文描述字符串
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
 * Truncates the given text to a specified maximum length.
 *
 * If the input text is empty or its length is within the maxLength limit, the original text is returned.
 * Otherwise, the text is truncated to maxLength characters with an ellipsis appended.
 *
 * @param text - The text to truncate.
 * @param maxLength - The maximum allowed length for the text.
 * @returns The original text if within the limit, or the truncated text followed by "..." if it exceeds maxLength.
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Generates a random alphanumeric identifier.
 *
 * This function creates a random string of the specified length using uppercase letters, lowercase letters, and digits.
 * It is useful for generating unique IDs for various applications.
 *
 * @param length - The desired length of the generated ID. Defaults to 32.
 * @returns A random string composed of alphanumeric characters.
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
 * Formats a given URL string and returns its canonical form.
 *
 * This function attempts to create a URL object from the provided string. If the string is a valid URL,
 * its canonical string representation is returned. If the input is not a valid URL, the error is logged
 * and the original string is returned.
 *
 * @param url - The URL string to be formatted.
 * @returns The formatted URL string if valid; otherwise, the original string.
 *
 * @example
 * const formatted = formatUrl("https://example.com/path?query=123");
 * // Returns: "https://example.com/path?query=123"
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
 * Formats an error into a user-friendly error message.
 *
 * This function checks the provided error:
 * - If it is an instance of Error, it returns the error's message.
 * - If it is a string, it returns the string directly.
 * - Otherwise, it returns a default message indicating an unknown error.
 *
 * @param error - The error to format, which may be an Error instance, a string, or any other type.
 * @returns A formatted error message.
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
 * Formats data into a paginated response structure.
 *
 * This function takes an array of items and pagination parameters, and returns an object containing
 * the list of items and a pagination object. The pagination details include the total number of items,
 * the current page number, the page size, and the total number of pages (calculated as the ceiling of total divided by page size).
 *
 * @typeparam T - The type of items in the data array.
 * @param data - The array of items for the current page.
 * @param total - The total number of items available.
 * @param page - The current page number.
 * @param pageSize - The number of items per page.
 * @returns An object with a `list` property holding the data array and a `pagination` property containing the pagination details.
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
 * This function constructs an object with a status code, a descriptive message,
 * and an optional data payload. It is intended to standardize response formats across the application.
 *
 * @param code - The status code indicating the result of an operation.
 * @param msg - A descriptive message providing additional details about the response.
 * @param data - Optional additional data associated with the response; defaults to null.
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
 * This function iterates over each key-value pair in the provided object and appends the pair to a
 * URLSearchParams instance if the value is not undefined or null. The resulting string is suitable
 * for use as a URL query string.
 *
 * @param params - An object containing query parameters as key-value pairs.
 * @returns A URL-encoded string representing the specified query parameters.
 *
 * @example
 * ```typescript
 * const queryString = formatQueryParams({ search: 'books', page: 2 });
 * // Returns: "search=books&page=2"
 * ```
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
 * Escapes HTML content by converting special characters into their HTML entities.
 *
 * This function creates a temporary HTML element, assigns the input string to its textContent,
 * and then retrieves the innerHTML, which contains the escaped version of the original text.
 * This technique helps prevent XSS attacks when rendering user-supplied content.
 *
 * @param html - The string containing HTML that needs to be escaped.
 * @returns The escaped HTML string.
 */
export function escapeHtml(html: string): string {
  const div = document.createElement('div')
  div.textContent = html
  return div.innerHTML
}

/**
 * Formats a file name into a URL-friendly string.
 *
 * This function converts the provided file name to lower case, replaces non-alphanumeric
 * characters with hyphens, collapses multiple hyphens into a single hyphen, and removes any
 * leading or trailing hyphens.
 *
 * @param fileName - The original file name string to format.
 * @returns A formatted, URL-friendly file name.
 *
 * @example
 * // Returns "example-file-name-txt"
 * formatFileName("Example File Name.txt");
 */
export function formatFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Formats a phone number into the pattern "XXX-XXXX-XXXX".
 *
 * This function inserts hyphens into a phone number string by grouping the first three digits,
 * the following four digits, and the last four digits. If the input is empty or falsy, it returns an empty string.
 *
 * @param phone - The phone number string to format (e.g., "13812345678").
 * @returns The formatted phone number (e.g., "138-1234-5678"), or an empty string if the input is empty.
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return ''
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
}

/**
 * Formats a numeric value as a currency string in Chinese Yuan (CNY).
 *
 * This function uses the Intl.NumberFormat API with the locale set to 'zh-CN' and the currency style set to 'CNY'
 * to convert the given numeric amount into a properly formatted currency string.
 *
 * @param amount - The numeric amount to format.
 * @returns The formatted currency string.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount)
}

/**
 * Formats a number into a localized string using Chinese (zh-CN) formatting.
 *
 * This function leverages the Intl.NumberFormat API to format the input number
 * with locale-specific separators as defined by the Chinese locale. It enhances
 * readability by inserting the appropriate thousand separators.
 *
 * @param num - The number to format.
 * @returns The formatted number as a string.
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num)
}

/**
 * Formats a decimal number as a percentage string.
 *
 * Multiplies the input value by 100, rounds it to two decimal places,
 * and appends a "%" symbol.
 *
 * @param value - A decimal number (e.g., 0.1234 represents 12.34%)
 * @returns The formatted percentage string (e.g., "12.34%")
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

/**
 * Formats a numeric timestamp as an ISO 8601 string.
 *
 * This function takes a timestamp in milliseconds, creates a Date object, and returns its
 * ISO 8601 string representation.
 *
 * @param timestamp - The timestamp in milliseconds since the Unix epoch.
 * @returns The formatted ISO 8601 date string.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * Formats the provided data as a pretty-printed JSON string.
 *
 * This function attempts to convert the input data to a JSON string using a 2-space indentation.
 * In case of an error (e.g., due to circular references or other serialization issues),
 * the error is logged and an empty string is returned.
 *
 * @param data - The data to be formatted as a JSON string.
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
 * Encodes a string into Base64 format.
 *
 * This function converts the provided string into its Base64 representation using Node.js Buffer.
 * If an error occurs during encoding, it logs the error along with the original string and returns an empty string.
 *
 * @param str - The string to be encoded.
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
 * Decodes a Base64-encoded string.
 *
 * This function converts a Base64-encoded string to its original string representation using Node.js Buffer.
 * If the decoding process fails (for example, if the provided string is not valid Base64), an error is logged and an empty string is returned.
 *
 * @param base64 - The Base64-encoded string to decode.
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
