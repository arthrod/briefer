import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'
import { ValidationError, AuthorizationError } from '../mf/chat/types/errors.js'
import { CONFIG } from '../mf/chat/config/constants.js'
import { logger } from '../logger.js'
import { ErrorResponse } from '../mf/chat/types/index.js'
import { ErrorCode } from '../constants/errorcode.js'

// accepts only alphanumeric characters, spaces and hyphens
const nameRegex = /^[a-zA-Z0-9\s-]+$/

/**
 * Validates the workspace name against the allowed pattern.
 *
 * This function checks if the provided workspace name contains only alphanumeric
 * characters, spaces, and hyphens as defined by the `nameRegex` pattern.
 *
 * @param name - The workspace name to validate.
 * @returns true if the name adheres to the allowed pattern; otherwise, false.
 */
export function isWorkspaceNameValid(name: string) {
  return nameRegex.test(name)
}

/**
 * Validates whether the provided user name adheres to the allowed pattern.
 *
 * This function checks if the given name matches the regular expression `nameRegex`,
 * which permits only alphanumeric characters, spaces, and hyphens.
 *
 * @param name - The user name to validate.
 * @returns True if the user name is valid based on the allowed pattern; otherwise, false.
 */
export function isUserNameValid(name: string) {
  return nameRegex.test(name)
}

/**
 * Validates that all required environment variables are defined.
 *
 * This function checks for the presence of the "AI_AGENT_URL" environment variable.
 * If the variable is not set, it throws a ValidationError, ensuring that
 * critical configuration parameters are available for proper application operation.
 *
 * @throws ValidationError - Thrown when "AI_AGENT_URL" is missing from the environment.
 */
export function validateEnvVars() {
  const requiredEnvVars = ['AI_AGENT_URL']
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new ValidationError(`Missing required environment variable: ${envVar}`)
    }
  }
}

/**
 * Validates data against a Zod schema.
 *
 * This function attempts to parse the given data using the provided Zod schema. If the data
 * conforms to the schema, the parsed data is returned. If a ZodError is encountered, it aggregates
 * the error messages from all validation failures and throws a ValidationError with a message that
 * includes the operation context. Any non-ZodError exceptions are rethrown.
 *
 * @param schema - The Zod schema used for validating the data.
 * @param data - The data to validate.
 * @param operation - A descriptor for the validation operation, used for contextual error messages.
 * @returns The validated and parsed data.
 * @throws ValidationError if the data does not meet the schema requirements.
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown, operation: string): T {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join('; ')
      throw new ValidationError(`${operation} validation failed: ${errorMessage}`)
    }
    throw error
  }
}

/**
 * Middleware to validate the request body against a provided Zod schema.
 *
 * This middleware uses the given schema to validate the `req.body` by invoking
 * the `validateSchema` function with the operation set to "Request". If the validation
 * succeeds, the validated data replaces the original `req.body` and the next middleware
 * is called. If validation fails, the resulting error is passed to the next error-handling middleware.
 *
 * @param schema - The Zod schema used to validate the request body.
 * @returns An Express middleware function that validates the request body.
 */
export function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = validateSchema(schema, req.body, 'Request')
      req.body = validatedData
      next()
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Validates whether the given ID string contains only allowed characters.
 *
 * The function tests if the input string is composed exclusively of alphanumeric characters,
 * hyphens (-), and underscores (_). It returns true if the ID meets these criteria, and false otherwise.
 *
 * @param id - The identifier string to validate.
 * @returns True if the ID is valid; otherwise, false.
 */
export function validateId(id: string): boolean {
  return /^[a-zA-Z0-9-_]+$/.test(id)
}

/**
 * Validates and adjusts pagination parameters to ensure they are within acceptable limits.
 *
 * The function converts the provided `page` and `pageSize` values to integers. It ensures that:
 * - `page` is at least 1 (defaulting to 1 if an invalid or falsy value is provided).
 * - `pageSize` is at least 1 and does not exceed the maximum allowed value defined in the configuration (`CONFIG.PAGINATION.MAX_PAGE_SIZE`). If `pageSize` is invalid or falsy, it defaults to `CONFIG.PAGINATION.DEFAULT_PAGE_SIZE`.
 *
 * @param page - The current page number, which may be non-integer or invalid.
 * @param pageSize - The number of items per page, which may be non-integer, invalid, or exceed the allowed maximum.
 * @returns An object containing the validated `page` and `pageSize` values.
 */
export function validatePagination(page: number, pageSize: number): {
  page: number
  pageSize: number
} {
  const validatedPage = Math.max(1, Math.floor(Number(page) || 1))
  const validatedPageSize = Math.min(
    Math.max(1, Math.floor(Number(pageSize) || CONFIG.PAGINATION.DEFAULT_PAGE_SIZE)),
    CONFIG.PAGINATION.MAX_PAGE_SIZE
  )

  return {
    page: validatedPage,
    pageSize: validatedPageSize,
  }
}

/**
 * Validates whether a given file type is among the allowed types.
 *
 * This function converts the provided file type to lower case and checks if it is present in the
 * given list of allowed file types.
 *
 * @param type - The file type to validate.
 * @param allowedTypes - The array of allowed file types.
 * @returns True if the file type is allowed, false otherwise.
 */
export function validateFileType(type: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(type.toLowerCase())
}

/**
 * Validates if a given file size is within the allowed maximum size.
 *
 * This function checks whether the provided file size is less than or equal to the maximum allowed size.
 *
 * @param size - The file size to validate.
 * @param maxSize - The maximum allowed file size.
 * @returns True if the file size is less than or equal to maxSize; otherwise, false.
 */
export function validateFileSize(size: number, maxSize: number): boolean {
  return size <= maxSize
}

/**
 * Validates whether the provided string is a well-formed URL.
 *
 * This function attempts to create a new URL object using the given string.
 * If the URL constructor succeeds, the function returns true.
 * Otherwise, if the constructor throws an error, the function returns false.
 *
 * @param url - The URL string to validate.
 * @returns True if the string is a valid URL; otherwise, false.
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Validates whether the provided date string can be parsed into a valid date.
 *
 * This function creates a Date object from the input string and checks if the resulting
 * date is valid by ensuring that its time value is not NaN.
 *
 * @param date - The date string to validate.
 * @returns True if the date string represents a valid date; otherwise, false.
 */
export function validateDate(date: string): boolean {
  const parsed = new Date(date)
  return !isNaN(parsed.getTime())
}

/**
 * Validates that an object contains all required properties with defined values.
 *
 * This function checks each property key specified in the `requiredProps` array to determine
 * if it exists in the object and its value is not `undefined`. It returns `true` only if every required
 * property meets these conditions.
 *
 * @param obj - The object whose properties are being validated.
 * @param requiredProps - An array of property keys that must exist in the object with defined values.
 * @returns A boolean indicating whether all required properties are present in the object.
 */
export function validateObjectProps<T extends object>(
  obj: T,
  requiredProps: (keyof T)[]
): boolean {
  return requiredProps.every(prop => prop in obj && obj[prop] !== undefined)
}

/**
 * Handles errors by logging the error details and sending an appropriate HTTP response.
 *
 * This function centralizes error handling for operations by inspecting the type of the error and
 * responding with a standardized error response. It differentiates errors based on their instances:
 * - If the error is a ValidationError, it responds with a 400 status code.
 * - If the error is an AuthorizationError, it responds with a 403 status code.
 * - For all other errors, it responds with a 500 status code and a generic internal server error message.
 *
 * @param err - The error object that was thrown, which may be a ValidationError, AuthorizationError, or other type.
 * @param req - The Express request object, potentially containing session and user details.
 * @param res - The Express response object used to send HTTP responses.
 * @param operation - A string representing the specific operation during which the error occurred.
 */
export function handleError(err: unknown, req: Request, res: Response, operation: string) {
  const errorMessage = formatErrorMessage(err)
  logger().error(`Error in ${operation}:`, { error: err, userId: req.session?.user?.id })
  
  if (err instanceof ValidationError) {
    return res.status(400).json(createErrorResponse(400, errorMessage))
  }
  
  if (err instanceof AuthorizationError) {
    return res.status(403).json(createErrorResponse(403, errorMessage))
  }
  
  return res.status(500).json(createErrorResponse(500, 'Internal server error'))
}

/**
 * Formats an unknown error into a human-readable error message.
 *
 * This function checks the type of the provided error and returns an appropriate message:
 * - If the error is an instance of the Error class, it returns the error's message.
 * - If the error is a string, it returns the string as-is.
 * - For all other cases, it returns a default error message.
 *
 * @param error - The error to format, which may be an Error object, a string, or any unknown value.
 * @returns The formatted error message.
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unknown error occurred'
}

/**
 * Creates a standardized error response object.
 *
 * This function constructs an error response using the provided error code and message.
 * The returned object includes the error code, an error message, and a `null` data field.
 *
 * @param code - The numerical code representing the error.
 * @param message - A descriptive error message.
 * @returns An object conforming to the ErrorResponse interface, with properties `code`, `msg`, and `data` (always `null`).
 */
export function createErrorResponse(code: number, message: string): ErrorResponse {
  return {
    code,
    msg: message,
    data: null
  }
}

/**
 * Wraps an asynchronous controller function with unified error handling.
 *
 * This function returns a new async middleware that invokes the provided controller handler.
 * It catches errors thrown during execution and processes them as follows:
 * - For an AuthorizationError, it responds with HTTP status 403 and a corresponding error message.
 * - For a ValidationError, it responds with HTTP status 400 and a corresponding error message.
 * - All other errors are delegated to the centralized handleError function for processing.
 *
 * @param handler - The async controller function to wrap. It receives an Express Request, Response, and additional arguments.
 * @param operation - A string representing the operation context for error logging and handling.
 * @returns An asynchronous middleware function that handles errors uniformly.
 *
 * @example
 * const safeController = withErrorHandler(async (req, res) => {
 *   // Controller logic
 *   res.send('Success');
 * }, 'fetchData');
 *
 * // Use safeController as an Express route handler.
 */
export function withErrorHandler(handler: (req: Request, res: Response, ...args: any[]) => Promise<any>, operation: string) {
  return async (req: Request, res: Response, ...args: any[]) => {
    try {
      return await handler(req, res, ...args)
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return res.status(403).json(createErrorResponse(403, err.message))
      }
      if (err instanceof ValidationError) {
        return res.status(400).json(createErrorResponse(400, err.message))
      }
      return handleError(err, req, res, operation)
    }
  }
}

/**
 * Middleware for validating the request's body, query, and params against a provided Zod schema.
 *
 * This middleware attempts to parse the incoming request data using the given Zod schema.
 * If the validation succeeds, the request is forwarded to the next middleware. Otherwise,
 * it responds with a 400 status code and detailed validation errors if the error is a ZodError,
 * or a 500 status code for unexpected errors.
 *
 * @param schema - A Zod schema defining the expected structure of the request's body, query, and params.
 * @returns An Express middleware function for handling schema validation.
 *
 * @example
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   body: z.object({
 *     name: z.string(),
 *   }),
 *   query: z.object({}),
 *   params: z.object({})
 * });
 *
 * app.use(validateSchemaMiddleware(schema));
 */
export function validateSchemaMiddleware(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      })
      next()
    } catch (error) {
      logger().warn('Schema validation failed:', { error })
      
      // Type guard to check if error is a Zod error
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: ErrorCode.PARAM_ERROR,
          msg: '请求参数验证失败',
          data: error.errors,
        })
      } else {
        // Handle other types of errors
        res.status(500).json({
          code: ErrorCode.SERVER_ERROR,
          msg: '服务器错误',
          data: null,
        })
      }
    }
  }
}

/**
 * Validates workspace access permissions.
 *
 * This middleware verifies that the request includes a "workspaceId" in its URL parameters and a valid "user.id" in the session.
 * If either parameter is missing, it responds with a 400 status code and an error message ("缺少必要参数") indicating that necessary parameters are missing.
 *
 * Note: The specific workspace access policy check is yet to be implemented.
 *
 * @param req - The Express Request object containing URL parameters and session data.
 * @param res - The Express Response object used to send response messages.
 * @param next - The callback to pass control to the next middleware.
 */
export function validateWorkspaceAccessMiddleware(req: Request, res: Response, next: NextFunction) {
  const { workspaceId } = req.params
  const userId = req.session?.user?.id

  if (!workspaceId || !userId) {
    return res.status(400).json({
      code: ErrorCode.PARAM_ERROR,
      msg: '缺少必要参数',
      data: null,
    })
  }

  // TODO: 实现工作区访问权限检查逻辑
  next()
}

/**
 * Middleware to validate the format of an ID parameter in the request.
 *
 * This middleware checks whether the URL parameter specified by `paramName` exists and is a 24-character hexadecimal string.
 * If the parameter is missing or its format is invalid, the middleware responds with a 400 status code and a JSON error message.
 *
 * @param paramName - The name of the URL parameter to validate. Defaults to 'id'.
 * @returns An Express middleware function that either calls `next()` if the ID is valid or sends a 400 error response if invalid.
 *
 * @example
 * // Validate the default 'id' parameter in a route:
 * app.get('/resource/:id', validateIdMiddleware(), (req, res) => { ... });
 *
 * @example
 * // Validate a custom parameter name:
 * app.get('/item/:customId', validateIdMiddleware('customId'), (req, res) => { ... });
 */
export function validateIdMiddleware(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName]

    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        code: ErrorCode.PARAM_ERROR,
        msg: 'ID格式无效',
        data: { paramName, id },
      })
    }

    next()
  }
}

/**
 * Validates that all required environment variables are present.
 *
 * This middleware checks that each environment variable specified in the `requiredVars` array is defined
 * in the process environment. If any required variables are missing, it logs the missing variables using
 * the application logger and throws a `ValidationError` with a detailed message.
 *
 * @param requiredVars - An array of environment variable names that must be set.
 *
 * @throws ValidationError If one or more required environment variables are not defined.
 */
export function validateEnvVarsMiddleware(requiredVars: string[]) {
  const missingVars = requiredVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    logger().error('Missing required environment variables:', { missingVars })
    throw new ValidationError(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
}

/**
 * Middleware to validate the size of the request body.
 *
 * This middleware checks the 'Content-Length' header of incoming requests to determine the size of the request body.
 * If the actual size exceeds the specified maximum size (`maxSize`), it returns a 413 (Payload Too Large) response with
 * a JSON error message including error code, message, and details about the maximum allowed size and actual content length.
 * Otherwise, it passes control to the next middleware.
 *
 * @param maxSize - The maximum allowed size for the request body in bytes.
 * @returns An Express middleware function.
 */
export function validateRequestSizeMiddleware(maxSize: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0')

    if (contentLength > maxSize) {
      return res.status(413).json({
        code: ErrorCode.PARAM_ERROR,
        msg: '请求体过大',
        data: {
          maxSize,
          contentLength,
        },
      })
    }

    next()
  }
}

/**
 * Middleware to validate the API version from request headers.
 *
 * This middleware checks if the request includes an 'api-version' header and verifies that its value is among the supported versions provided.
 * If the header is missing or the version is unsupported, it returns a 400 response with an error message detailing the supported versions and the requested version.
 * Otherwise, it calls next() to continue to the subsequent middleware.
 *
 * @param supportedVersions - An array of supported API version strings.
 * @returns An Express middleware function.
 */
export function validateApiVersionMiddleware(supportedVersions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = req.headers['api-version']

    if (!version || !supportedVersions.includes(version as string)) {
      return res.status(400).json({
        code: ErrorCode.PARAM_ERROR,
        msg: '不支持的API版本',
        data: {
          supportedVersions,
          requestedVersion: version,
        },
      })
    }

    next()
  }
}
