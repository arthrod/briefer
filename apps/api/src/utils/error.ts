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
 * 通用错误处理中间件
 *
 * 捕获并处理应用程序中所有未捕获的错误，根据不同错误类型返回相应的 HTTP 状态码和标准化 JSON 响应，并记录错误详情（包括错误消息、堆栈和请求 ID）。
 *
 * @param error - 捕获的错误对象，可以是 APIError、DatabaseError、TimeoutError、ValidationError、AuthorizationError 或其他错误类型。
 * @param req - Express 请求对象，包含请求相关信息（例如请求 ID）。
 * @param res - Express 响应对象，用于发送错误响应。
 * @param next - Express 中间件函数，当错误需要传递给下一个处理中间件时使用。
 *
 * @remarks
 * - 若错误为 APIError，则返回错误中指定的 statusCode、code、msg 和 data。
 * - 若错误为 DatabaseError，则返回 500 状态码，错误码为 DATABASE_ERROR，消息为 "数据库操作失败"。
 * - 若错误为 TimeoutError，则返回 408 状态码，错误码为 TIMEOUT_ERROR，消息为 "请求超时"。
 * - 若错误为 ValidationError，则返回 400 状态码，错误码为 PARAM_ERROR，并附带错误详情。
 * - 若错误为 AuthorizationError，则返回 401 状态码，错误码为 UNAUTHORIZED，消息为相应认证错误信息。
 * - 对于其他类型的错误，默认返回 500 状态码，错误码为 SERVER_ERROR，消息为 "服务器内部错误"。
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
 * Wraps an asynchronous middleware function, automatically catching any errors and forwarding them to the next middleware.
 *
 * This function returns a new middleware function that executes the provided async function. If an error is thrown
 * during the asynchronous operation, it is caught and passed to Express's error handling middleware via `next(error)`.
 *
 * @param fn - The asynchronous middleware function to wrap, which should accept Request, Response, and NextFunction parameters.
 * @returns A middleware function that handles errors by catching them and forwarding to the next middleware.
 *
 * @example
 * const asyncHandler = asyncErrorHandler(async (req, res, next) => {
 *   const data = await fetchData();
 *   res.json(data);
 * });
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
 * Handles 404 Not Found errors.
 *
 * Sends a JSON response indicating that the requested resource does not exist.
 * The response includes a standardized error code, message, and null data, and
 * is sent with a 404 HTTP status.
 *
 * @param req - The Express request object.
 * @param res - The Express response object used to send the JSON response.
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    code: ErrorCode.NOT_FOUND,
    msg: '请求的资源不存在',
    data: null,
  })
}

/**
 * Generates a standardized error response.
 *
 * This function creates an error response object with a numeric error code, a descriptive message,
 * and optional additional data. It ensures that error responses are consistent throughout the application.
 *
 * @param code - The error code representing the type of error.
 * @param message - A descriptive message detailing the error.
 * @param data - Optional additional data for context. Defaults to null.
 * @returns An object with properties `code`, `msg` (the error message), and `data`.
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
 * Logs detailed error information along with any additional context.
 *
 * This function uses the application's logger to record the error message and stack trace.
 * It also includes any extra context provided in the log, which can assist in troubleshooting.
 *
 * @param error - The error to be logged, including its message and stack trace.
 * @param context - An optional object containing extra context to include in the log (defaults to an empty object).
 */
export function logError(error: Error, context: any = {}) {
  logger().error('Error details:', {
    error: error.message,
    stack: error.stack,
    ...context,
  })
}

/**
 * Handles business logic errors by logging a warning and returning a standardized error response.
 *
 * This function logs the provided error message at the warning level and generates an error response using the given error code.
 * If the error does not contain a message, the default message is used.
 *
 * @param error - The error object representing the business logic error.
 * @param errorCode - The numeric code associated with the business error.
 * @param defaultMessage - The fallback message used if the error's message is empty.
 * @returns An object representing the standardized error response.
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
 * This function logs the error's message and stack trace using the application's logger,
 * then returns an error response object created by `createErrorResponse` with a specific
 * database error code and a message indicating that the database operation has failed.
 *
 * @param error - The error object encountered during a database operation.
 * @returns A standardized error response object with a database error code and descriptive message.
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
 * Logs details of an API error and returns a standardized error response.
 *
 * This function captures the error's message and stack trace using the logger, then
 * constructs and returns a standardized response object by invoking `createErrorResponse`
 * with a predefined API error code and message.
 *
 * @param error - The error encountered during an API call.
 * @returns An object representing the standardized error response for API failures.
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
 * This function logs the error message and stack trace using the logger, and then creates an error response
 * with a specific error code for timeout errors. The response indicates that the request has timed out.
 *
 * @param error - The error object representing the timeout condition.
 * @returns A standardized error response object with a timeout error code and a message indicating the timeout.
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
 * Handles parameter validation errors by logging a warning and returning a standardized error response.
 *
 * This function logs the provided error message using a warning level and then constructs
 * a standardized error response with an error code indicating a parameter validation failure.
 *
 * @param error - The validation error to be handled.
 * @returns A standardized error response object indicating that the parameter validation failed.
 */
export function handleValidationError(error: Error) {
  logger().warn('Validation error:', { error: error.message })
  return createErrorResponse(
    ErrorCode.PARAM_ERROR,
    '参数验证失败'
  )
}

/**
 * 处理身份验证错误
 *
 * 当检测到身份验证错误时，该函数记录一条警告日志，并返回一个标准化的错误响应对象，表示认证失败。
 *
 * @param error - 捕获的错误对象，其 message 属性提供错误的详细信息
 * @returns 一个包含错误码 (ErrorCode.UNAUTHORIZED) 和错误消息 ('认证失败') 的错误响应对象
 */
export function handleAuthError(error: Error) {
  logger().warn('Auth error:', { error: error.message })
  return createErrorResponse(
    ErrorCode.UNAUTHORIZED,
    '认证失败'
  )
}

/**
 * Formats the stack trace of an error for improved readability.
 *
 * This function processes the error's stack trace by removing the first line,
 * which usually contains the error message, and then trimming each subsequent line.
 * The formatted lines are joined together with newline characters.
 *
 * @param error - The error object containing the stack trace.
 * @returns A string representing the formatted error stack trace, or an empty string if no stack trace is available.
 */
export function formatErrorStack(error: Error): string {
  if (!error.stack) return ''
  return error.stack
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .join('\n')
}
