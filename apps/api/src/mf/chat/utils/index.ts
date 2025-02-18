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
 * Logs details for incoming HTTP requests and their corresponding responses.
 *
 * This middleware logs the request details (such as method, URL, query parameters,
 * body, user agent, and user ID, if available) when the request starts. Once the response
 * has finished, it logs the response status code and the total duration taken to process the request.
 *
 * @param req - The Express Request object containing details of the HTTP request.
 * @param res - The Express Response object used to send back the response.
 * @param next - The NextFunction callback to pass control to the next middleware in the chain.
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
 * Middleware to validate the user session.
 *
 * This function checks if the incoming request has a valid session with an authenticated user.
 * If either the session or the user is missing, it responds with a 401 Unauthorized status along with a standardized error JSON object.
 * When the session is valid, it passes control to the next middleware in the Express pipeline.
 *
 * @param req - The Express request object, expected to include a session with a user property.
 * @param res - The Express response object used to send the HTTP response.
 * @param next - The next middleware function in the Express request handling chain.
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
 * Middleware that sets the CORS headers to allow cross-origin requests.
 *
 * This middleware sets the following headers:
 * - `Access-Control-Allow-Origin` to `*` to allow requests from any origin.
 * - `Access-Control-Allow-Methods` to `GET, PUT, POST, DELETE` to restrict allowed HTTP methods.
 * - `Access-Control-Allow-Headers` to `Content-Type` to restrict allowed headers.
 *
 * For preflight (OPTIONS) requests, it responds immediately with a 200 status code.
 *
 * @param req - The Express Request object.
 * @param res - The Express Response object.
 * @param next - The next middleware function in the Express routing chain.
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
 * Middleware for rate limiting incoming requests.
 *
 * This middleware tracks the timestamps of requests based on the client's IP address using an in-memory Map. It enforces a rate limit by allowing a maximum number of requests per IP within a specified time window. If an IP exceeds the allowed number of requests within that window, the middleware responds with a 429 status code and an error message.
 *
 * @param windowMs - The duration of the time window in milliseconds (default is 60000).
 * @param maxRequests - The maximum allowable number of requests per IP within the time window (default is 100).
 * @returns An Express middleware function that limits requests and, if the limit is exceeded, sends a 429 response.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { rateLimiter } from './utils';
 *
 * const app = express();
 * app.use(rateLimiter(60000, 100));
 *
 * // Define routes...
 *
 * app.listen(3000, () => {
 *   console.log('Server running on port 3000');
 * });
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
 * Middleware that assigns a unique request ID to each incoming HTTP request.
 *
 * This middleware generates a unique identifier by concatenating the current timestamp with a random string.
 * It attaches the generated ID to the request object (req.id) and sets it in the response headers as "X-Request-ID",
 * which facilitates tracking and logging of requests in the application.
 *
 * @param req - The incoming HTTP request object.
 * @param res - The HTTP response object.
 * @param next - The callback to pass control to the next middleware function.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  req.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  res.setHeader('X-Request-ID', req.id)
  next()
}

/**
 * Handles unhandled errors by logging the error details and sending a standardized error response.
 *
 * This middleware logs the error object, its stack trace, the unique request ID, and the user ID (if available from the session).
 * It then sends a JSON response with HTTP status 500, including a standardized error code,
 * an internal server error message, and a null data field.
 *
 * @param err - The error object that was thrown.
 * @param req - The Express request object, which may contain session data and a unique request ID.
 * @param res - The Express response object used to send the error response.
 * @param next - The next middleware function in the Express request lifecycle (not used here).
 *
 * @example
 * // In an Express application, use as error-handling middleware:
 * app.use(errorResponseMiddleware);
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
 * Sends a JSON response containing the server's current status, timestamp, and uptime.
 * This endpoint is useful for monitoring and confirming that the service is operational.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 *
 * @example
 * // Use the healthCheck middleware in an Express application:
 * import express from 'express';
 * import { healthCheck } from './utils';
 *
 * const app = express();
 * app.get('/health', healthCheck);
 *
 * app.listen(3000, () => console.log('Server running on port 3000'));
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