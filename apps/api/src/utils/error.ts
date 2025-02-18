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
 * Express middleware to handle errors and send structured JSON responses.
 *
 * This middleware logs detailed error information—including the error message, stack trace, and request ID—
 * and dispatches a response with an appropriate HTTP status and JSON payload based on the error type:
 *
 * - APIError: Returns the error's own status code along with its custom error code, message, and data.
 * - DatabaseError: Responds with a 500 status code, a DATABASE_ERROR code, and a standard failure message.
 * - TimeoutError: Responds with a 408 status code, a TIMEOUT_ERROR code, and a standard timeout message.
 * - ValidationError: Responds with a 400 status code, a PARAM_ERROR code, the error message, and additional details.
 * - AuthorizationError: Responds with a 401 status code, an UNAUTHORIZED code, and the error message.
 * - Unrecognized errors: Defaults to a 500 Internal Server Error with a SERVER_ERROR code and message.
 *
 * @param error - The error that was thrown during request processing.
 * @param req - The Express request object, providing context such as the request ID.
 * @param res - The Express response object used to send the HTTP response.
 * @param next - The next middleware function in the Express stack.
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
 * Wraps an asynchronous Express route handler to catch and forward errors.
 *
 * This function takes an asynchronous route handler and returns a new middleware function.
 * When invoked, the returned function executes the provided handler. If an error is encountered,
 * it is caught and passed to the next middleware via the `next` function, ensuring centralized error handling.
 *
 * @param fn - The asynchronous route handler function to wrap.
 * @returns A middleware function that invokes the provided handler and forwards any errors.
 *
 * @example
 * router.get('/example', asyncErrorHandler(async (req, res, next) => {
 *   const data = await fetchData();
 *   res.json(data);
 * }));
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
 * Handles 404 Not Found errors for Express routes.
 *
 * This middleware function sends a JSON response with an HTTP 404 status code,
 * including a standardized error code, a message indicating that the requested resource
 * does not exist, and a null data payload.
 *
 * @param req - The Express request object.
 * @param res - The Express response object used to send the HTTP response.
 *
 * @example
 * // In an Express app, register this middleware after all route handlers:
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
 * Creates a standardized error response object.
 *
 * This function returns an object containing an error code, a descriptive error message,
 * and optionally any additional error-related data. The generated response object is
 * designed to be used across the application for consistent error handling.
 *
 * @param code - The error code that represents the specific error condition.
 * @param message - A message that describes the error.
 * @param data - (Optional) Additional data providing more context about the error (defaults to null).
 * @returns An object with properties: `code`, `msg` (derived from the message), and `data`.
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
 * Logs error details using the application's logger.
 *
 * This function logs the provided error's message and stack trace, along with any additional context
 * provided. It is typically used in error handling middleware to record error information for debugging
 * and traceability purposes.
 *
 * @param error - The error object containing the error message and stack trace.
 * @param context - Optional additional context to include in the logs. Defaults to an empty object.
 */
export function logError(error: Error, context: any = {}) {
  logger().error('Error details:', {
    error: error.message,
    stack: error.stack,
    ...context,
  })
}

/**
 * Handles business errors by logging a warning and returning a standardized error response.
 *
 * This function logs the provided error message at a warning level and generates an error response
 * using the specified error code and the error's message. If the error object does not contain a message,
 * the provided default message is used instead.
 *
 * @param error - The error object encountered during business logic execution.
 * @param errorCode - A numeric code representing the specific business error.
 * @param defaultMessage - A fallback message to use if the error object lacks a message.
 * @returns A standardized error response object containing the error code and message.
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
 * Handles database errors by logging detailed error information and returning a standardized error response.
 *
 * This function logs the error message and stack trace using the logger, and then constructs an error response
 * with a specific error code (ErrorCode.DATABASE_ERROR) and a message indicating a database operation failure.
 *
 * @param error - The error object representing the database error.
 * @returns A standardized error response object for the database error.
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
 * Handles API errors by logging error details and generating a standardized error response.
 *
 * This function logs the provided error's message and stack trace using the application's logger,
 * and then returns an error response object with a predefined API error code and default error message.
 *
 * @param error - The error object representing the API error.
 * @returns A standardized error response object indicating that the API call failed.
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
 * Handles a timeout error by logging the error details and returning a standardized error response.
 *
 * This function logs the error message and stack trace using the configured logger, then creates an error response
 * with the timeout error code and a message indicating that the request has timed out.
 *
 * @param error - The Error object representing the encountered timeout.
 * @returns A standardized error response object for the timeout error.
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
 * Handles a validation error by logging a warning and returning a standardized error response.
 *
 * This function logs the provided error's message as a warning and then returns an error response
 * object using the predefined error code for parameter validation errors. The response message indicates
 * that parameter validation has failed.
 *
 * @param error - The error object representing the validation failure.
 * @returns A standardized error response object containing the error code and a failure message.
 */
export function handleValidationError(error: Error) {
  logger().warn('Validation error:', { error: error.message })
  return createErrorResponse(
    ErrorCode.PARAM_ERROR,
    '参数验证失败'
  )
}

/**
 * Handles authentication errors by logging a warning message and returning a standardized error response.
 *
 * This function logs a warning message containing the authentication error details, then generates
 * and returns a standardized error response indicating that the authentication failed.
 *
 * @param error - The error object that triggered the authentication failure.
 * @returns A standardized error response object with an unauthorized error code and a failure message.
 */
export function handleAuthError(error: Error) {
  logger().warn('Auth error:', { error: error.message })
  return createErrorResponse(
    ErrorCode.UNAUTHORIZED,
    '认证失败'
  )
}

/**
 * Formats an error's stack trace by removing the error message and trimming each line.
 *
 * This function checks if the provided error contains a stack trace. If a stack trace exists, it removes the first line,
 * trims the whitespace from each subsequent line, and then joins them back together. If no stack trace is present, it returns an empty string.
 *
 * @param error - The error object containing a potential stack trace.
 * @returns The formatted stack trace string, or an empty string if no stack is available.
 */
export function formatErrorStack(error: Error): string {
  if (!error.stack) return ''
  return error.stack
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .join('\n')
}
