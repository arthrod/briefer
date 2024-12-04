import { Request, Response, NextFunction } from 'express'
import { logger } from '../../../logger.js'
import { CONFIG } from '../config/constants.js'
import {
  APIError,
  DatabaseError,
  TimeoutError,
  ValidationError,
  AuthorizationError,
  ERROR_CODES,
} from '../types/errors.js'

// 通用错误处理中间件
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger().error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    requestId: req.id,
  })

  // API错误
  if (error instanceof APIError) {
    return res.status(error.statusCode).json({
      code: error.code,
      msg: error.message,
      data: error.data,
    })
  }

  // 数据库错误
  if (error instanceof DatabaseError) {
    return res.status(500).json({
      code: ERROR_CODES.DATABASE_ERROR,
      msg: '数据库操作失败',
      data: null,
    })
  }

  // 超时错误
  if (error instanceof TimeoutError) {
    return res.status(408).json({
      code: ERROR_CODES.TIMEOUT_ERROR,
      msg: '请求超时',
      data: null,
    })
  }

  // 验证错误
  if (error instanceof ValidationError) {
    return res.status(400).json({
      code: ERROR_CODES.VALIDATION_ERROR,
      msg: error.message,
      data: error.details,
    })
  }

  // 认证错误
  if (error instanceof AuthorizationError) {
    return res.status(401).json({
      code: ERROR_CODES.AUTH_ERROR,
      msg: error.message,
      data: null,
    })
  }

  // 默认服务器错误
  res.status(500).json({
    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    msg: '服务器内部错误',
    data: null,
  })
}

// 异步错误处理包装器
export function asyncErrorHandler(fn: Function) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

// 404错误处理
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    code: ERROR_CODES.NOT_FOUND,
    msg: '请求的资源不存在',
    data: null,
  })
}

// 错误响应生成器
export function createErrorResponse(
  code: number,
  message: string,
  data: any = null
) {
  return {
    code,
    msg: message,
    data,
  }
}

// 错误日志记录
export function logError(error: Error, context: any = {}) {
  logger().error('Error details:', {
    error: error.message,
    stack: error.stack,
    ...context,
  })
}

// 业务错误处理
export function handleBusinessError(
  error: Error,
  errorCode: number,
  defaultMessage: string
) {
  logger().warn('Business error:', { error: error.message })
  return createErrorResponse(errorCode, error.message || defaultMessage)
}

// 数据库错误处理
export function handleDatabaseError(error: Error) {
  logger().error('Database error:', {
    error: error.message,
    stack: error.stack,
  })
  return createErrorResponse(
    ERROR_CODES.DATABASE_ERROR,
    '数据库操作失败'
  )
}

// API错误处理
export function handleAPIError(error: Error) {
  logger().error('API error:', {
    error: error.message,
    stack: error.stack,
  })
  return createErrorResponse(
    ERROR_CODES.API_ERROR,
    '接口调用失败'
  )
}

// 超时错误处理
export function handleTimeoutError(error: Error) {
  logger().error('Timeout error:', {
    error: error.message,
    stack: error.stack,
  })
  return createErrorResponse(
    ERROR_CODES.TIMEOUT_ERROR,
    '请求超时'
  )
}

// 验证错误处理
export function handleValidationError(error: Error) {
  logger().warn('Validation error:', { error: error.message })
  return createErrorResponse(
    ERROR_CODES.VALIDATION_ERROR,
    '参数验证失败'
  )
}

// 认证错误处理
export function handleAuthError(error: Error) {
  logger().warn('Auth error:', { error: error.message })
  return createErrorResponse(
    ERROR_CODES.AUTH_ERROR,
    '认证失败'
  )
}

// 错误堆栈格式化
export function formatErrorStack(error: Error): string {
  if (!error.stack) return ''
  return error.stack
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .join('\n')
}
