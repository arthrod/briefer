import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'
import { ValidationError, AuthorizationError } from '../types/errors.js'
import { CONFIG } from '../config/constants.js'
import { logger } from '../../../logger.js'
import { ErrorResponse } from '../types/index.js'

// 环境变量验证
export function validateEnvVars() {
  const requiredEnvVars = ['AI_AGENT_URL']
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new ValidationError(`Missing required environment variable: ${envVar}`)
    }
  }
}

// Schema验证
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

// 请求验证中间件
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

// ID验证
export function validateId(id: string): boolean {
  return /^[a-zA-Z0-9-_]+$/.test(id)
}

// 分页参数验证
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

// 文件类型验证
export function validateFileType(type: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(type.toLowerCase())
}

// 文件大小验证
export function validateFileSize(size: number, maxSize: number): boolean {
  return size <= maxSize
}

// URL验证
export function validateUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// 日期验证
export function validateDate(date: string): boolean {
  const parsed = new Date(date)
  return !isNaN(parsed.getTime())
}

// 对象属性验证
export function validateObjectProps<T extends object>(
  obj: T,
  requiredProps: (keyof T)[]
): boolean {
  return requiredProps.every(prop => prop in obj && obj[prop] !== undefined)
}

// 错误处理
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

// 错误消息格式化
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unknown error occurred'
}

// 创建错误响应
export function createErrorResponse(code: number, message: string): ErrorResponse {
  return {
    code,
    msg: message,
    data: null
  }
}

// Schema验证中间件
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
          code: CONFIG.ERROR_CODES.VALIDATION_ERROR,
          msg: '请求参数验证失败',
          data: error.errors,
        })
      } else {
        // Handle other types of errors
        res.status(500).json({
          code: CONFIG.ERROR_CODES.INTERNAL_SERVER_ERROR,
          msg: '服务器错误',
          data: null,
        })
      }
    }
  }
}

// 工作区权限验证
export function validateWorkspaceAccessMiddleware(req: Request, res: Response, next: NextFunction) {
  const { workspaceId } = req.params
  const userId = req.session?.user?.id

  if (!workspaceId || !userId) {
    return res.status(400).json({
      code: CONFIG.ERROR_CODES.VALIDATION_ERROR,
      msg: '缺少必要参数',
      data: null,
    })
  }

  // TODO: 实现工作区访问权限检查逻辑
  next()
}

// ID格式验证
export function validateIdMiddleware(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName]

    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        code: CONFIG.ERROR_CODES.VALIDATION_ERROR,
        msg: 'ID格式无效',
        data: { paramName, id },
      })
    }

    next()
  }
}

// 环境变量验证
export function validateEnvVarsMiddleware(requiredVars: string[]) {
  const missingVars = requiredVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    logger().error('Missing required environment variables:', { missingVars })
    throw new ValidationError(`Missing required environment variables: ${missingVars.join(', ')}`)
  }
}

// 请求体大小验证
export function validateRequestSizeMiddleware(maxSize: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0')

    if (contentLength > maxSize) {
      return res.status(413).json({
        code: CONFIG.ERROR_CODES.VALIDATION_ERROR,
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

// API版本验证
export function validateApiVersionMiddleware(supportedVersions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = req.headers['api-version']

    if (!version || !supportedVersions.includes(version as string)) {
      return res.status(400).json({
        code: CONFIG.ERROR_CODES.VALIDATION_ERROR,
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
