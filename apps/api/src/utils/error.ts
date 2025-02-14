import { Request, Response, NextFunction } from 'express'
import { logger } from '../logger.js'
import {
  APIError,
  DatabaseError,
  TimeoutError,
  ValidationError,
  AuthorizationError,
} from '../mf/chat/types/errors.js'
import { ErrorCode } from '../constants/errorcode.js'

/**
 * Express middleware for handling errors by categorizing them into API, database, timeout, validation,
 * and authorization errors. Logs the error details and sends an appropriate JSON response based on the type of error.
 *
 * Depending on the error instance:
 * - For an APIError, responds with its specific status code and error details.
 * - For a DatabaseError, responds with a 500 status code and a generic database error message.
 * - For a TimeoutError, responds with a 408 status code and a timeout message.
 * - For a ValidationError, responds with a 400 status code and validation error details.
 * - For an AuthorizationError, responds with a 401 status code and an unauthorized message.
 * - For all other errors, responds with a 500 status code and a generic server error message.
 *
 * @param error - The error object encountered during request processing.
 * @param req - The Express request object, whose `id` property is used for logging.
 * @param res - The Express response object used to send the error details.
 * @param next - The next middleware function in the Express pipeline.
 */
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
      code: ErrorCode.DATABASE_ERROR,
      msg: '数据库操作失败',
      data: null,
    })
  }

  // 超时错误
  if (error instanceof TimeoutError) {
    return res.status(408).json({
      code: ErrorCode.TIMEOUT_ERROR,
      msg: '请求超时',
      data: null,
    })
  }

  // 验证错误
  if (error instanceof ValidationError) {
    return res.status(400).json({
      code: ErrorCode.PARAM_ERROR,
      msg: error.message,
      data: error.details,
    })
  }

  // 认证错误
  if (error instanceof AuthorizationError) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      msg: error.message,
      data: null,
    })
  }

  // 默认服务器错误
  res.status(500).json({
    code: ErrorCode.SERVER_ERROR,
    msg: '服务器内部错误',
    data: null,
  })
}

/**
 * Wraps an asynchronous route handler to catch errors and forward them to the next middleware.
 *
 * This function returns a new function that calls the provided async route handler within a try-catch block. If the
 * handler throws an error during its execution, the error is caught and passed to the next middleware using the `next`
 * function. This helps to simplify error handling in Express routes for asynchronous operations.
 *
 * @param fn - The async route handler function to be wrapped.
 * @returns A new route handler function that handles asynchronous errors.
 *
 * @example
 * ```ts
 * app.get('/example', asyncErrorHandler(async (req, res, next) => {
 *   const data = await someAsyncFunction();
 *   res.json(data);
 * }));
 * ```
 */
export function asyncErrorHandler(fn: Function) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Handles 404 "Not Found" errors by sending a JSON response indicating that the requested resource does not exist.
 *
 * This middleware function sets the HTTP status code to 404 and returns a standardized JSON error response
 * containing an error code, a descriptive message (in Chinese), and a null data field. It should be used as 
 * the last middleware in the routing chain to catch requests that do not match any defined routes.
 *
 * @param req - The Express Request object.
 * @param res - The Express Response object used to send the error response.
 *
 * @example
 * app.use(notFoundHandler);
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    code: ErrorCode.NOT_FOUND,
    msg: '请求的资源不存在',
    data: null,
  })
}

/**
 * Generates a standardized error response object.
 *
 * This function creates and returns an error response with a consistent structure containing an error code,
 * a descriptive message, and optionally additional data. It is used throughout the application to format error
 * outputs in a uniform manner.
 *
 * @param code - The error code indicating the specific type of error.
 * @param message - A descriptive message explaining the error.
 * @param data - Optional additional data providing more context about the error. Defaults to null.
 * @returns An object containing the error response with properties: `code`, `msg`, and `data`.
 */
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

/**
 * Logs detailed information about an error along with optional contextual data.
 *
 * This function uses the configured logger to record the error message, stack trace,
 * and any additional information provided in the context. It helps in diagnosing issues
 * by consolidating error details and related context.
 *
 * @param error - The error object containing the error message and stack trace.
 * @param context - Optional additional context to include in the log entry.
 */
export function logError(error: Error, context: any = {}) {
  logger().error('Error details:', {
    error: error.message,
    stack: error.stack,
    ...context,
  })
}

/**
 * Handles a business-related error by logging it and returning a standardized error response.
 *
 * This function logs the encountered error with a warning level and then generates a standardized
 * error response using the provided error code and message. If the error object does not have a message,
 * the specified default message is used.
 *
 * @param error - The error object representing the business error.
 * @param errorCode - The error code to associate with the response.
 * @param defaultMessage - A fallback message if the error object does not contain a message.
 * @returns An error response object containing the error code and message.
 */
export function handleBusinessError(
  error: Error,
  errorCode: number,
  defaultMessage: string
) {
  logger().warn('Business error:', { error: error.message })
  return createErrorResponse(errorCode, error.message || defaultMessage)
}

/**
 * Handles a database error by logging its details and returning a standardized error response.
 *
 * This function logs the error message and stack trace of the encountered database error using the application logger,
 * and then returns an error response object created with a predefined database error code and a fixed message indicating
 * that a database operation has failed.
 *
 * @param error - The encountered database error.
 * @returns A standardized error response object indicating a database operation failure.
 */
export function handleDatabaseError(error: Error) {
  logger().error('Database error:', {
    error: error.message,
    stack: error.stack,
  })
  return createErrorResponse(
    ErrorCode.DATABASE_ERROR,
    '数据库操作失败'
  )
}

/**
 * Handles API errors by logging the error details and returning a standardized error response.
 *
 * This function logs an API error, including its message and stack trace, using the application logger.
 * It then returns a standardized error response created with a predefined error code (ErrorCode.API_ERROR)
 * and a message indicating the API call failure ("接口调用失败").
 *
 * @param error - The error encountered during an API call.
 * @returns A standardized error response object with an API error code and failure message.
 */
export function handleAPIError(error: Error) {
  logger().error('API error:', {
    error: error.message,
    stack: error.stack,
  })
  return createErrorResponse(
    ErrorCode.API_ERROR,
    '接口调用失败'
  )
}

/**
 * Handles a timeout error by logging its details and returning a standardized error response.
 *
 * This function logs the error message and stack trace using the application's logger, and then generates an error response
 * with a designated timeout error code and message ("请求超时"), indicating that the request has timed out.
 *
 * @param error - The error object representing the timeout error.
 * @returns A standardized error response object indicating a timeout error.
 */
export function handleTimeoutError(error: Error) {
  logger().error('Timeout error:', {
    error: error.message,
    stack: error.stack,
  })
  return createErrorResponse(
    ErrorCode.TIMEOUT_ERROR,
    '请求超时'
  )
}

/**
 * 处理参数验证错误，记录警告日志，并返回标准化的错误响应对象。
 *
 * 当检测到参数验证错误时，此函数会记录一个包含错误信息的警告日志，并调用 createErrorResponse 返回带有错误码和提示信息的响应对象。
 *
 * @param error - 表示参数验证错误的 Error 对象
 * @returns 标准化的错误响应对象，包含错误码 "ErrorCode.PARAM_ERROR" 和错误信息 "参数验证失败"
 */
export function handleValidationError(error: Error) {
  logger().warn('Validation error:', { error: error.message })
  return createErrorResponse(
    ErrorCode.PARAM_ERROR,
    '参数验证失败'
  )
}

/**
 * Handles authentication errors by logging detailed information and returning a standardized unauthorized error response.
 *
 * This function logs a warning message with the authentication error details and returns an error response using the
 * `createErrorResponse` utility. The returned response uses the `ErrorCode.UNAUTHORIZED` code and a fixed message "认证失败".
 *
 * @param error - The error object representing the authentication failure.
 * @returns A standardized error response indicating unauthorized access.
 */
export function handleAuthError(error: Error) {
  logger().warn('Auth error:', { error: error.message })
  return createErrorResponse(
    ErrorCode.UNAUTHORIZED,
    '认证失败'
  )
}

/**
 * Formats the stack trace of an Error object.
 *
 * This function removes the first line of the error stack (typically the error message),
 * trims each subsequent line to remove extra whitespace, and then joins them into a single string.
 * If the Error object does not have a stack trace, an empty string is returned.
 *
 * @param error - The Error object whose stack trace is to be formatted.
 * @returns A formatted stack trace string, or an empty string if no stack trace is available.
 */
export function formatErrorStack(error: Error): string {
  if (!error.stack) return ''
  return error.stack
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .join('\n')
}
