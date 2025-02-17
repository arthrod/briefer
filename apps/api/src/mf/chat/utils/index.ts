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
 * Middleware for logging HTTP request and response details.
 *
 * Logs the incoming request's method, URL, query parameters, body, user agent, and session user ID (if available)
 * when the request starts. Once the response is finished, it logs the response status code and the duration of the request.
 *
 * @param req - The Express Request object containing details about the HTTP request.
 * @param res - The Express Response object for sending the response and registering finish event listeners.
 * @param next - The Express NextFunction to pass control to the next middleware.
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
 * Middleware to validate the existence of a user session.
 *
 * This middleware checks if the incoming request contains a session with an authenticated user.
 * If the session or the user is missing, it responds with a 401 Unauthorized status and a corresponding
 * error message in JSON format. Otherwise, it passes control to the next middleware.
 *
 * @param req - The Express request object which may include session data.
 * @param res - The Express response object used to send back the HTTP response.
 * @param next - The callback function to pass control to the subsequent middleware.
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
 * CORS middleware for Express applications.
 *
 * Sets the necessary headers to allow cross-origin requests from any origin. It supports GET, PUT, POST, and DELETE methods, and permits the 'Content-Type' header.
 * For preflight OPTIONS requests, it sends a 200 status response immediately.
 *
 * @param req - The incoming HTTP request object.
 * @param res - The outgoing HTTP response object.
 * @param next - The next middleware function in the Express routing pipeline.
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
 * Limits the number of requests from a single IP address within a specified time window.
 *
 * This middleware maintains an in-memory map that tracks the timestamps of requests made by each IP address.
 * It filters these timestamps to include only those within the defined time window. If the number of recent
 * requests reaches or exceeds the maximum allowed, the middleware sends a 429 Too Many Requests response.
 * Otherwise, it records the current request's timestamp and passes control to the next middleware.
 *
 * @param windowMs - The duration of the time window in milliseconds during which requests are counted. Default is 60000 (1 minute).
 * @param maxRequests - The maximum number of allowed requests within the time window. Default is 100.
 * @returns An Express middleware function that enforces rate limiting.
 *
 * @example
 * ```typescript
 * app.use(rateLimiter(60000, 100));
 * ```
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
 * Attaches a unique request ID to the HTTP request.
 *
 * This middleware generates a unique identifier by combining the current timestamp with a random alphanumeric string.
 * The generated ID is assigned to `req.id` and set in the response header `X-Request-ID`.
 *
 * @param req - The incoming request object.
 * @param res - The response object where the request ID is set as a header.
 * @param next - The next middleware function in the stack.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  res.setHeader('X-Request-ID', req.id)
  next()
}

/**
 * Express error-handling middleware that logs unhandled errors and sends a standardized HTTP 500 response.
 *
 * This middleware captures detailed error information—including the error object, its stack trace,
 * the request ID, and the user ID (if available from the session)—and logs it for debugging purposes.
 * It then responds with an HTTP status of 500 by returning a JSON object containing a server error code,
 * a generic internal server error message, and null as data.
 *
 * @param err - The error object encountered during request processing.
 * @param req - The Express request object, which may contain session and request ID details.
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
 * Health check middleware.
 *
 * Responds with a JSON object containing the status of the application,
 * the current timestamp (in ISO format), and the server's uptime.
 *
 * @remarks
 * This endpoint is typically used by load balancers or monitoring tools to verify
 * that the service is running correctly.
 *
 * @param req - The Express Request object.
 * @param res - The Express Response object used to send the JSON response.
 *
 * @example
 * // Using the healthCheck middleware in an Express route.
 * app.get('/health', healthCheck);
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