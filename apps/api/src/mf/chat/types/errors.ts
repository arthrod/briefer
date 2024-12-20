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
