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
 * Validates a workspace name.
 *
 * This function checks whether the provided workspace name contains only
 * alphanumeric characters, spaces, and hyphens by testing it against a regular expression.
 *
 * @param name - The workspace name to validate.
 * @returns True if the workspace name is valid, otherwise false.
 */
export function isWorkspaceNameValid(name: string) {
  return nameRegex.test(name)
}

/**
 * Validates whether the given user name meets the required format.
 *
 * This function checks if the provided user name string matches the expected pattern,
 * which typically allows alphanumeric characters, spaces, and hyphens.
 *
 * @param name - The user name to validate.
 * @returns True if the user name is valid; otherwise, false.
 */
export function isUserNameValid(name: string) {
  return nameRegex.test(name)
}

/**
 * Validates that all required environment variables are present.
 *
 * This function checks that all critical environment variables (currently only "AI_AGENT_URL")
 * are defined in the process environment. If any required variable is missing, it throws a
 * ValidationError with a message indicating which variable is absent.
 *
 * @throws ValidationError - Thrown if a required environment variable is not set in process.env.
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
 * Validates the provided data against a specified Zod schema.
 *
 * This function attempts to parse the given data using the provided Zod schema. If the data
 * does not conform to the schema, it catches the ZodError, constructs a detailed error message
 * identifying all issues, and throws a ValidationError with contextual information from the
 * provided operation string.
 *
 * @param schema - The Zod schema to validate against.
 * @param data - The data to be validated.
 * @param operation - A string indicating the operation context, used to prefix the error message.
 * @returns The validated and parsed data of type T.
 * @throws ValidationError if the input data fails schema validation.
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
 * Validates the incoming request body against the provided Zod schema.
 *
 * This middleware function uses the given Zod schema to validate the body of an HTTP request.
 * If the validation is successful, the request body is replaced with the validated data before
 * passing control to the next middleware. If validation fails, the resulting error is forwarded
 * to the next error-handling middleware.
 *
 * @param schema - A Zod schema used for validating the request body.
 * @returns An Express middleware function for request body validation.
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
 * Validates whether the provided ID consists solely of alphanumeric characters, hyphens, and underscores.
 *
 * This function uses a regular expression to ensure that the input string `id` contains only:
 * - Letters (both uppercase and lowercase)
 * - Numbers
 * - Hyphens
 * - Underscores
 *
 * @param id - The ID string to validate.
 * @returns True if the ID is valid; otherwise, false.
 */
export function validateId(id: string): boolean {
  return /^[a-zA-Z0-9-_]+$/.test(id)
}

/**
 * Validates and normalizes pagination parameters.
 *
 * This function ensures that the provided page and pageSize are within valid numerical bounds.
 * The page number is converted to a positive integer and is set to at least 1.
 * The pageSize is similarly converted, defaulting to CONFIG.PAGINATION.DEFAULT_PAGE_SIZE when not valid,
 * and is capped at CONFIG.PAGINATION.MAX_PAGE_SIZE.
 *
 * @param page - The requested page number.
 * @param pageSize - The requested number of items per page.
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
 * Validates whether a given file type is allowed.
 *
 * This function converts the input file type to lowercase and checks if it exists in the provided array
 * of allowed file types.
 *
 * @param type - The file type to validate.
 * @param allowedTypes - The list of permitted file types.
 * @returns True if the normalized file type is included in `allowedTypes`; otherwise, false.
 */
export function validateFileType(type: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(type.toLowerCase())
}

/**
 * Validates whether the provided file size does not exceed the maximum allowed size.
 *
 * @param size - The current file size.
 * @param maxSize - The maximum allowable file size.
 * @returns True if the file size is less than or equal to the maximum size; otherwise, false.
 */
export function validateFileSize(size: number, maxSize: number): boolean {
  return size <= maxSize
}

/**
 * Checks if the provided string is a valid URL.
 *
 * This function attempts to create a new URL object with the input string.
 * If the URL constructor does not throw an error, the URL is considered well-formed.
 *
 * @param url - The string to validate as a URL.
 * @returns True if the input string is a valid URL, false otherwise.
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
 * Validates if the provided string represents a valid date.
 *
 * This function attempts to create a Date object from the input string and checks whether
 * the resulting date is valid by ensuring the time value is not NaN.
 *
 * @param date - The date string to be validated.
 * @returns True if the input string is a valid date, false otherwise.
 */
export function validateDate(date: string): boolean {
  const parsed = new Date(date)
  return !isNaN(parsed.getTime())
}

/**
 * Validates that the given object contains all the required properties and that none are `undefined`.
 *
 * This function checks whether every property specified in `requiredProps` exists in the object `obj`
 * and has a defined value. It returns `true` only when all required properties exist and are not `undefined`.
 *
 * @param obj - The object to be checked.
 * @param requiredProps - An array of keys representing the required properties in the object.
 * @returns `true` if all required properties are present and defined, otherwise `false`.
 */
export function validateObjectProps<T extends object>(
  obj: T,
  requiredProps: (keyof T)[]
): boolean {
  return requiredProps.every(prop => prop in obj && obj[prop] !== undefined)
}

/**
 * Handles an error by logging its details and sending an appropriate HTTP response.
 *
 * This function logs error information along with the user ID (if available) and determines the correct HTTP
 * status code based on the error type. If the error is a ValidationError, it responds with a 400 status code.
 * If it is an AuthorizationError, it responds with a 403 status code. For any other errors, it responds with a 500
 * status code and a generic 'Internal server error' message.
 *
 * @param err - The error encountered during the operation.
 * @param req - The Express.js Request object; used here to extract session and user details.
 * @param res - The Express.js Response object; used to send the HTTP response corresponding to the error.
 * @param operation - A description of the operation during which the error occurred; used for logging purposes.
 *
 * @returns A JSON response with an appropriate HTTP status code and error message.
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
 * Formats an error message from an unknown error type into a human-readable string.
 *
 * This function inspects the provided error value. If the error is an instance of Error, it returns
 * the error's message. If the error is a string, it returns the error string directly. For any other type,
 * it returns a default message indicating that an unknown error occurred.
 *
 * @param error - The error to format, which can be of any type.
 * @returns A string representing the formatted error message.
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
 * This function constructs an error response object that includes an error code,
 * a descriptive message, and a null data field. It is intended for use in API responses
 * to provide consistent error formatting.
 *
 * @param code - The error or HTTP status code.
 * @param message - A descriptive error message.
 * @returns An ErrorResponse object containing the error code, message (as 'msg'), and null data.
 */
export function createErrorResponse(code: number, message: string): ErrorResponse {
  return {
    code,
    msg: message,
    data: null
  }
}

/**
 * Wraps an asynchronous controller handler to provide unified error handling.
 *
 * This function returns an Express middleware function that executes the provided handler
 * and intercepts any errors. If the handler throws an error, the middleware sends a standardized
 * HTTP response based on the error type. Specifically, it returns a 403 status code for 
 * `AuthorizationError`, a 400 status code for `ValidationError`, and delegates all other errors
 * to the global error handler.
 *
 * @param handler - An asynchronous controller function that processes the request.
 * @param operation - A string representing the current operation, used for error logging.
 *
 * @returns A new Express middleware function with enhanced error handling.
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
 * Middleware to validate a request against a given Zod schema.
 *
 * This middleware extracts the body, query, and params from the incoming Express request and validates them
 * using the provided Zod schema. If the validation passes, it calls next() to forward the request. If validation
 * fails due to a ZodError, it sends a 400 response with error details; for all other errors, it sends a 500 response.
 *
 * @param schema - A Zod schema used for validating the request data.
 * @returns An Express middleware function that validates the request.
 *
 * @example
 * // Example usage in an Express route:
 * app.post('/api/data', validateSchemaMiddleware(myZodSchema), (req, res) => {
 *   res.send('Request data is valid.');
 * });
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
 * Validates that the request contains the required workspace and user identifiers.
 *
 * This middleware checks for the presence of a `workspaceId` in the request parameters and a user `id` in the session.
 * If either value is missing, it responds with a 400 status code and an appropriate error message.
 * Otherwise, it calls the next middleware in the stack.
 *
 * @param req - The Express request object, expected to include `params.workspaceId` and a `session.user.id`.
 * @param res - The Express response object used to return HTTP responses.
 * @param next - The function to invoke the next middleware.
 *
 * @todo Implement detailed workspace access permission logic.
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
 * Middleware for validating a request parameter as a valid MongoDB ObjectId.
 *
 * This middleware checks if the specified parameter in the request (defaulting to "id") matches
 * the required 24-character hexadecimal format of a MongoDB ObjectId. If the parameter is missing
 * or does not conform to the pattern, the middleware responds with a 400 status code and a JSON
 * error message containing an error code, a descriptive message, and the parameter details.
 *
 * @param paramName - The name of the request parameter to validate. Defaults to "id".
 * @returns An Express middleware function that validates the ID format.
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
 * Validates that all required environment variables are set.
 *
 * This middleware checks whether each variable specified in the `requiredVars` array exists in the current process environment.
 * If any required environment variable is missing, it logs an error with details of the missing variables and throws a `ValidationError`.
 *
 * @param requiredVars - An array containing the names of required environment variables.
 *
 * @throws ValidationError - Thrown when one or more required environment variables are not present.
 */
export function validateEnvVarsMiddleware(requiredVars: string[]) {
  const missingVars = requiredVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    logger().error('Missing required environment variables:', { missingVars })
    throw new ValidationError(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
}

/**
 * Middleware to validate the size of the incoming request body.
 *
 * This middleware checks the "Content-Length" header of an HTTP request and compares it against the provided maximum size (in bytes). If the content length exceeds the specified maxSize, it responds with a 413 (Payload Too Large) status and an error JSON object containing the error code, a message indicating that the request body is too large, and details including the allowed maximum and the actual content length. If the content length is within the limit, it delegates control to the next middleware.
 *
 * @param maxSize - The maximum allowed request body size in bytes.
 *
 * @returns An Express middleware function that validates the request body size.
 *
 * @example
 * // Limit incoming request bodies to 1 MB
 * app.use(validateRequestSizeMiddleware(1024 * 1024));
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
 * Middleware to validate the API version in the request headers.
 *
 * This middleware inspects the "api-version" header of the incoming request and checks
 * whether it exists and if its value is within the specified list of supported versions.
 * If the API version is missing or not supported, the middleware sends a 400 response with
 * an error message and details about the supported versions. Otherwise, it calls the next middleware.
 *
 * @param supportedVersions - An array of strings representing the supported API versions.
 *
 * @returns An Express middleware function that validates the API version.
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
