export * from '../../../utils/cache'
export * from '../../../utils/error'
export * from './fetch'
export * from '../../../utils/format'
export * from '../stream/rag-stream'
export * from '../../../utils/validation'

import { Request, Response, NextFunction } from 'express'
import { logger } from '../../../logger.js'
import { ERROR_CODES, ERROR_MESSAGES } from '../types/errors'

// 异步包装器
export const asyncWrapper = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// 请求日志中间件
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  const { method, url, body, query, headers } = req

  // 请求开始日志
  logger().info('Request started', {
    method,
    url,
    query,
    body,
    userAgent: headers['user-agent'],
    userId: req.session?.user?.id,
  })

  // 响应完成时的日志
  res.on('finish', () => {
    const duration = Date.now() - start
    logger().info('Request completed', {
      method,
      url,
      status: res.statusCode,
      duration,
      userId: req.session?.user?.id,
    })
  })

  next()
}

// 会话验证中间件
export function sessionValidator(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      code: ERROR_CODES.AUTH_ERROR,
      msg: ERROR_MESSAGES.AUTH_ERROR,
      data: null,
    })
  }
  next()
}

// CORS中间件
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  
  next()
}

// 请求限制中间件
export function rateLimiter(
  windowMs: number = 60000,
  maxRequests: number = 100
) {
  const requests = new Map()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip
    const now = Date.now()
    const windowStart = now - windowMs

    if (!requests.has(key)) {
      requests.set(key, [])
    }

    const userRequests = requests.get(key)
    const recentRequests = userRequests.filter((time: number) => time > windowStart)

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        code: 429,
        msg: '请求过于频繁，请稍后再试',
        data: null,
      })
    }

    recentRequests.push(now)
    requests.set(key, recentRequests)

    next()
  }
}

// 请求ID中间件
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  res.setHeader('X-Request-ID', req.id)
  next()
}

// 错误响应中间件
export function errorResponseMiddleware(err: Error, req: Request, res: Response, next: NextFunction) {
  logger().error('Unhandled error:', {
    error: err,
    stack: err.stack,
    requestId: req.id,
    userId: req.session?.user?.id,
  })

  res.status(500).json({
    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    msg: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    data: null,
  })
}

// 健康检查中间件
export function healthCheck(req: Request, res: Response) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
}

// 输入数据清理函数
export const sanitizeInput = (input: string): string => {
  if (!input) return ''
  input = input.replace(/<[^>]*>/g, '')
  input = input.replace(/[<>'"]/g, '')
  input = input.replace(/[\x00-\x1F\x7F]/g, '')
  return input.trim()
}

// 日期格式化函数
export const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// 环境变量验证函数
export const validateEnvVars = () => {
  const requiredEnvVars = ['AI_AGENT_URL']
  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
}

// 错误响应创建函数
export const createErrorResponse = (code: number, message: string) => ({
  code,
  msg: message,
  data: null,
})

// SSE连接设置函数
export const setupSSEConnection = (res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
}

// 错误消息格式化函数
export const formatErrorMessage = (error: unknown): string => {
  // 记录原始错误信息到日志
  logger().error({
    msg: 'Error details',
    data: {
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
    },
  })

  return [
    '```error',
    '抱歉，操作未能成功，请稍后再试。如果问题持续，请联系我们的支持团队！ 🙏',
    '```',
  ].join('\n')
}