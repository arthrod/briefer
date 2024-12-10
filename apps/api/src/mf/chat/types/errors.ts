// 错误类定义
export const ERROR_CODES = {
  SUCCESS: 0,           // 成功
  VALIDATION_ERROR: 400,  // 验证错误
  AUTH_ERROR: 401,      // 认证错误
  FORBIDDEN: 403,       // 禁止
  NOT_FOUND: 404,       // 未找到
  INTERNAL_SERVER_ERROR: 500,    // 服务器错误
  DATABASE_ERROR: 501,   // 数据库错误
  API_ERROR: 502,        // API错误
  TIMEOUT_ERROR: 504,   // 超时错误
};

export const ERROR_MESSAGES = {
  VALIDATION_ERROR: '请求参数错误',
  AUTH_ERROR: '认证失败或无权限',
  FORBIDDEN: '禁止访问',
  NOT_FOUND: '资源不存在',
  INTERNAL_SERVER_ERROR: '服务器内部错误',
  TIMEOUT_ERROR: '请求超时',
};

export class ValidationError extends Error {
  details?: any

  constructor(message: string, details?: any) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class APIError extends Error {
  code: number
  statusCode: number
  data?: any

  constructor(message: string, code: number = 500, statusCode: number = 500, data?: any) {
    super(message)
    this.name = 'APIError'
    this.code = code
    this.statusCode = statusCode
    this.data = data
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}
