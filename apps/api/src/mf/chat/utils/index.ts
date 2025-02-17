export * from '../../../utils/cache'
export * from '../../../utils/error'
export * from './fetch'
export * from '../../../utils/format'
export * from '../stream/rag-stream'
export * from '../../../utils/validation'

import { Request, Response, NextFunction } from 'express'
import { logger } from '../../../logger.js'
import { ErrorCode, ErrorMessage } from '../../../constants/errorcode'

// 异步包装器
export const asyncWrapper = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Logs details of incoming HTTP requests and their completion.
 *
 * This middleware logs the start of an HTTP request, capturing the HTTP method, URL, query parameters,
 * request body, the user agent from the headers, and the user ID from the session if available.
 * Once the response is finished, it logs the response status and the duration of the request.
 *
 * @param req - The Express Request object containing details of the incoming request.
 * @param res - The Express Response object used to send the HTTP response.
 * @param next - The Express NextFunction callback to pass control to the next middleware in the chain.
 */
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

/**
 * Middleware that validates the user session for authenticated requests.
 *
 * This middleware checks whether the request contains a valid session with an authenticated user.
 * If either the session or the user is missing, it responds with a 401 Unauthorized status and
 * a JSON object containing an error code, an error message, and a null data field.
 * Otherwise, it passes control to the next middleware in the Express request-response cycle.
 *
 * @param req - The Express request object, which should include a session property with a user.
 * @param res - The Express response object used to send a response when validation fails.
 * @param next - The next middleware function to call when the session is valid.
 */
export function sessionValidator(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      msg: ErrorMessage.AUTH_ERROR,
      data: null,
    })
  }
  next()
}

/**
 * CORS middleware for setting allowed origins, methods, and headers.
 *
 * This middleware configures the response with CORS headers to enable cross-origin requests.
 * It allows any origin and permits the HTTP methods GET, PUT, POST, and DELETE, while restricting
 * allowed headers to "Content-Type". For preflight OPTIONS requests, it immediately sends a 200 OK
 * response, bypassing further middleware.
 *
 * @param req - The Express Request object.
 * @param res - The Express Response object.
 * @param next - The next middleware function in the Express pipeline.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  
  next()
}

/**
 * Rate limiting middleware.
 *
 * This middleware limits the number of requests from a single IP address within a specified time window.
 * It tracks the timestamp of each request for each IP in an in-memory map. If the number of requests within
 * the current time window exceeds the allowed maximum, the middleware responds with a 429 status code and an
 * error message indicating that the requests are too frequent.
 *
 * @param windowMs - The duration of the time window in milliseconds to monitor (default is 60000 ms).
 * @param maxRequests - The maximum number of requests allowed within the time window (default is 100).
 * @returns An Express middleware function that enforces the rate limit.
 */
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

/**
 * Attaches a unique request ID to each incoming request.
 *
 * Generates a unique identifier by combining the current timestamp with a random alphanumeric string.
 * This ID is assigned to the request object's `id` property and set in the response header `X-Request-ID`
 * to help track and correlate requests throughout the system.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @param next - The function to pass control to the next middleware.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  res.setHeader('X-Request-ID', req.id)
  next()
}

/**
 * Express middleware for handling unhandled errors.
 *
 * This middleware logs details of the error—including the error object, stack trace, request ID, and user ID (if available)
 * from the session—and sends a standardized JSON response with a 500 Internal Server Error status. The response object
 * includes a predefined error code, message, and null data to indicate a server error.
 *
 * @param err - The error object representing the unhandled error.
 * @param req - The Express request object, which contains additional properties such as a unique request ID and session data.
 * @param res - The Express response object used to send the error response.
 * @param next - The next middleware function in the Express middleware chain.
 */
export function errorResponseMiddleware(err: Error, req: Request, res: Response, next: NextFunction) {
  logger().error('Unhandled error:', {
    error: err,
    stack: err.stack,
    requestId: req.id,
    userId: req.session?.user?.id,
  })

  res.status(500).json({
    code: ErrorCode.SERVER_ERROR,
    msg: ErrorMessage.INTERNAL_SERVER_ERROR,
    data: null,
  })
}

/**
 * 健康检查中间件，返回服务的健康状态信息。
 *
 * 该中间件响应一个 JSON 对象，包含以下信息：
 * - 服务状态（'ok'）
 * - 当前时间戳（ISO 格式）
 * - 服务器运行时长（以秒为单位）
 *
 * @param req - Express 的请求对象
 * @param res - Express 的响应对象，用于返回 JSON 格式的健康数据
 */
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