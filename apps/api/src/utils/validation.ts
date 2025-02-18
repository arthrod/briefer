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
 * Checks if a workspace name is valid based on a predefined pattern.
 *
 * This function tests the supplied workspace name against a regular expression
 * that permits alphanumeric characters, spaces, and hyphens.
 *
 * @param name - The workspace name to validate.
 * @returns True if the workspace name is valid; otherwise, false.
 */
export function isWorkspaceNameValid(name: string) {
  return nameRegex.test(name)
}

/**
 * Checks if the provided user name is valid.
 *
 * This function tests whether the given user name matches the predefined pattern from `nameRegex`,
 * which typically allows alphanumeric characters, spaces, and hyphens.
 *
 * @param name - The user name to validate.
 * @returns True if the user name is valid, otherwise false.
 */
export function isUserNameValid(name: string) {
  return nameRegex.test(name)
}

/**
 * Validates that all required environment variables are set.
 *
 * This function checks the process environment for the presence of essential variables. Currently,
 * it verifies that the 'AI_AGENT_URL' variable is defined. If any required environment variable is missing,
 * a ValidationError is thrown with a descriptive message.
 *
 * @throws ValidationError - If a required environment variable is not defined.
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
 * Validates and parses data against the provided Zod schema.
 *
 * This function attempts to parse the given data using the specified Zod schema. If
 * the validation is successful, the parsed data is returned. If the data fails to
 * conform to the schema, the function catches the resulting ZodError, constructs a
 * detailed error message using the provided operation context, and throws a ValidationError.
 *
 * @param schema - The Zod schema to validate against.
 * @param data - The data to be validated.
 * @param operation - A descriptive label for the current operation, used in error messages.
 * @returns The parsed data that conforms to the provided schema.
 *
 * @throws ValidationError - Thrown when the data fails schema validation, with detailed messages.
 *
 * @example
 * const schema = z.object({ username: z.string(), age: z.number() });
 * const inputData = { username: "johndoe", age: "30" }; // Incorrect type for age
 * try {
 *   const validData = validateSchema(schema, inputData, "User Registration");
 * } catch (error) {
 *   console.error(error.message);
 * }
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
 * Middleware that validates the request body against a provided Zod schema.
 *
 * This function returns an Express middleware that checks the incoming request's body
 * using the specified Zod schema via the `validateSchema` function. If the request body
 * is valid, it replaces the original body with the validated data and calls the next middleware;
 * otherwise, it forwards the error to the next error handler.
 *
 * @param schema - The Zod schema used to validate the request body.
 *
 * @returns An Express middleware function.
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
 * Validates that the provided ID contains only allowed characters.
 *
 * This function checks whether the given ID string consists solely of alphanumeric characters,
 * hyphens (-), and underscores (_). If the ID matches the allowed format, the function returns true;
 * otherwise, it returns false.
 *
 * @param id - The ID string to validate.
 * @returns True if the ID is valid; otherwise, false.
 *
 * @example
 * // Returns true for a valid ID
 * const valid = validateId("user_123-abc");
 *
 * @example
 * // Returns false due to invalid characters (e.g., a space)
 * const valid = validateId("user 123");
 */
export function validateId(id: string): boolean {
  return /^[a-zA-Z0-9-_]+$/.test(id)
}

/**
 * Validates and adjusts pagination parameters.
 *
 * This function processes the provided page number and page size values to ensure they fall within acceptable ranges:
 * - Converts both inputs to integers using `Math.floor`.
 * - Ensures the page number is at least 1.
 * - Uses a default page size from configuration if the provided value is falsy, and enforces it to be at least 1 and at most the maximum allowed page size defined in configuration.
 *
 * @param page - The raw page number input; defaults to 1 if invalid.
 * @param pageSize - The raw page size input; defaults to the configured default and is capped at the maximum allowed page size.
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
 * Validates if a file type is allowed.
 *
 * Converts the provided file type to lowercase and checks whether it is included
 * in the array of permitted file types.
 *
 * @param type - The file type to validate.
 * @param allowedTypes - An array containing the allowed file types.
 * @returns True if the file type is valid; otherwise, false.
 */
export function validateFileType(type: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(type.toLowerCase())
}

/**
 * Validates whether the given file size is within the allowed maximum limit.
 *
 * @param size - The actual file size to validate.
 * @param maxSize - The maximum permitted file size.
 * @returns True if the file size is less than or equal to the maximum allowed size; otherwise, false.
 */
export function validateFileSize(size: number, maxSize: number): boolean {
  return size <= maxSize
}

/**
 * Validates whether the provided string is a properly formatted URL.
 *
 * This function tries to create a new URL instance using the input string.
 * If the URL constructor succeeds, the string is considered a valid URL and
 * the function returns true. Otherwise, it catches the error and returns false.
 *
 * @param url - The string to validate as a URL.
 * @returns True if the string is a valid URL, otherwise false.
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
 * Validates whether a given string can be parsed into a valid date.
 *
 * This function creates a Date object from the input string and checks if the resulting time value is valid.
 * It returns true if the string represents a valid date format, and false otherwise.
 *
 * @param date - The string to validate as a date.
 * @returns True if the string is a valid date, false otherwise.
 */
export function validateDate(date: string): boolean {
  const parsed = new Date(date)
  return !isNaN(parsed.getTime())
}

/**
 * Validates that an object contains all required properties with defined values.
 *
 * This function checks if every property listed in `requiredProps` exists in the object `obj`
 * and ensures that none of these property values are `undefined`. It returns `true` only if all
 * required properties are present and have defined values, otherwise it returns `false`.
 *
 * @param obj - The object to validate.
 * @param requiredProps - An array of keys representing the required properties of the object.
 * @returns A boolean indicating whether the object satisfies the property requirements.
 */
export function validateObjectProps<T extends object>(
  obj: T,
  requiredProps: (keyof T)[]
): boolean {
  return requiredProps.every(prop => prop in obj && obj[prop] !== undefined)
}

/**
 * Handles an error by logging it and sending an appropriate HTTP response.
 *
 * This function examines the error object and, based on its type, sends a standardized error response:
 * - Returns a 400 Bad Request response if the error is a ValidationError.
 * - Returns a 403 Forbidden response if the error is an AuthorizationError.
 * - Defaults to a 500 Internal Server Error response for all other errors.
 *
 * The error details are logged along with the user's ID from the request session (if available) to aid in debugging.
 *
 * @param err - The error object that occurred during the operation.
 * @param req - The Express Request object containing the session and user information.
 * @param res - The Express Response object used to send the error response.
 * @param operation - A string representing the context or operation in which the error occurred.
 *
 * @returns The HTTP response with a JSON error message and the corresponding status code.
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
 * Formats an error into a readable message.
 *
 * If the provided error is an instance of Error, its message property is returned.
 * If the error is a string, it is returned as-is.
 * For all other cases, a default message indicating an unknown error is returned.
 *
 * @param error - The error object or string to format.
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
 * This function returns an object conforming to the ErrorResponse interface,
 * containing an error code, a descriptive message, and a null data field.
 *
 * @param code - The numeric error code representing the type of error.
 * @param message - A descriptive error message.
 * @returns An ErrorResponse object with the provided code, message, and a null data field.
 */
export function createErrorResponse(code: number, message: string): ErrorResponse {
  return {
    code,
    msg: message,
    data: null
  }
}

/**
 * Unified controller error handling wrapper function.
 *
 * This function wraps an asynchronous controller function and provides
 * centralized error handling. It intercepts errors thrown during the execution
 * of the controller and returns corresponding HTTP responses:
 * 
 * - Returns a 403 response if an AuthorizationError is caught.
 * - Returns a 400 response if a ValidationError is caught.
 * - Delegates any other errors to the handleError function.
 *
 * @param handler - The asynchronous controller function to be executed.
 * @param operation - A description of the operation or context in which the controller is executed.
 * @returns A new asynchronous function with built-in error handling that can be used as middleware.
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
 * Express middleware that validates request data using a provided Zod schema.
 *
 * This middleware extracts the body, query, and params from the request and attempts to validate them with the given Zod schema.
 * - If validation succeeds, the middleware calls `next()` to pass control to the next handler.
 * - If a Zod validation error occurs, it logs a warning and responds with a 400 status code along with detailed error information.
 * - If any other error occurs, it responds with a 500 status code to indicate a server error.
 *
 * @param schema - A Zod schema used to validate the request's body, query, and params.
 * @returns An Express middleware function.
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
 * Middleware to validate workspace access for a request.
 *
 * This middleware checks that the request parameters include a valid workspace identifier (`workspaceId`)
 * and that the session contains an authenticated user identifier (`userId`). If either is missing, the
 * middleware responds with a 400 status code, an error code indicating a parameter error, and a message
 * stating that necessary parameters are missing.
 *
 * Note: The actual workspace access check logic is marked as TODO and should be implemented in the future.
 *
 * @param req - The Express Request object containing parameters and session data.
 * @param res - The Express Response object used to send responses.
 * @param next - The NextFunction callback to pass control to the next middleware.
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
 * Middleware to validate the format of an ID parameter.
 *
 * This middleware checks if the specified URL parameter (defaulting to 'id') exists and adheres
 * to a 24-character hexadecimal format, which is typical for MongoDB ObjectIDs. If the ID is missing
 * or invalid, the middleware responds with a 400 status code and a JSON error message that includes
 * error details.
 *
 * @param paramName - The name of the URL parameter to validate. Defaults to 'id'.
 *
 * @returns An Express middleware function that validates the ID parameter.
 *
 * @example
 * // Validate the default 'id' parameter:
 * app.get('/users/:id', validateIdMiddleware(), (req, res) => {
 *   // Proceed if id is valid.
 * });
 *
 * @example
 * // Validate a custom parameter name:
 * app.get('/posts/:postId', validateIdMiddleware('postId'), (req, res) => {
 *   // Proceed if postId is valid.
 * });
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
 * This middleware checks the Node.js process environment for each variable listed in the
 * `requiredVars` array. If any required environment variable is missing, it logs an error
 * with the names of the missing variables and throws a `ValidationError` with a descriptive message.
 *
 * @param requiredVars - An array of environment variable names that are required.
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
 * Middleware to validate the size of an incoming request body.
 *
 * This middleware checks the 'content-length' header from the incoming request and compares it to the
 * specified maximum allowed size (in bytes). If the content length exceeds the allowed size, the middleware
 * responds with a 413 (Payload Too Large) status and returns a JSON error message containing the maximum allowed
 * size and the actual content length. Otherwise, it passes control to the next middleware.
 *
 * @param maxSize - The maximum allowed size for the request body in bytes.
 * @returns An Express middleware function that validates the request body size.
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
 * This function returns an Express middleware that checks if the API version specified in the
 * request's "api-version" header is included in the provided list of supported versions.
 * If the version is missing or unsupported, the middleware sends a 400 response with a JSON error
 * object containing an error code, message, and details about the supported versions and the 
 * requested version; otherwise, it calls `next()` to continue processing.
 *
 * @param supportedVersions - An array of supported API version strings.
 *
 * @example
 * // Example usage in an Express app:
 * app.use(validateApiVersionMiddleware(['1.0', '2.0']));
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
