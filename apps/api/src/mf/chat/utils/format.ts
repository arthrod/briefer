import { logger } from '../../../logger.js'
import { CONFIG } from '../config/constants.js'

// 输入净化
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // 移除HTML标签
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 移除控制字符
    .replace(/&/g, '&amp;') // 转义特殊字符
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim() // 移除首尾空格
}

// 日期格式化
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

// 错误消息格式化
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return CONFIG.ERROR_MESSAGES.INTERNAL_SERVER_ERROR
}

// 创建错误响应
export function createErrorResponse(code: number, message: string) {
  return {
    code,
    msg: message,
    data: null
  }
}

// 创建成功响应
export function createSuccessResponse<T>(data: T, message: string = 'success') {
  return {
    code: CONFIG.ERROR_CODES.SUCCESS,
    msg: message,
    data
  }
}

// 日期时间格式化
export function formatDateTime(date: Date): string {
  try {
    return date.toISOString()
  } catch (error) {
    logger().error('Date formatting error:', { error, date })
    return ''
  }
}

// 文件大小格式化
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
}

// 时间差格式化
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

// 文本截断
export function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// 随机ID生成
export function generateRandomId(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// URL格式化
export function formatUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.toString()
  } catch (error) {
    logger().error('URL formatting error:', { error, url })
    return url
  }
}

// 错误消息格式化
export function formatErrorMessageNew(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return '未知错误'
}

// 分页数据格式化
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

// 响应数据格式化
export function formatResponse(code: number, msg: string, data: any = null) {
  return {
    code,
    msg,
    data,
  }
}

// 查询参数格式化
export function formatQueryParams(params: Record<string, any>): string {
  const searchParams = new URLSearchParams()
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value))
    }
  })
  
  return searchParams.toString()
}

// HTML转义
export function escapeHtml(html: string): string {
  const div = document.createElement('div')
  div.textContent = html
  return div.innerHTML
}

// 文件名格式化
export function formatFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// 手机号格式化
export function formatPhoneNumber(phone: string): string {
  if (!phone) return ''
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
}

// 金额格式化
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount)
}

// 数字格式化
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num)
}

// 百分比格式化
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

// 时间戳格式化
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

// JSON格式化
export function formatJSON(data: any): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch (error) {
    logger().error('JSON formatting error:', { error, data })
    return ''
  }
}

// Base64编码
export function formatBase64(str: string): string {
  try {
    return Buffer.from(str).toString('base64')
  } catch (error) {
    logger().error('Base64 encoding error:', { error, str })
    return ''
  }
}

// 解码Base64
export function decodeBase64(base64: string): string {
  try {
    return Buffer.from(base64, 'base64').toString()
  } catch (error) {
    logger().error('Base64 decoding error:', { error, base64 })
    return ''
  }
}
