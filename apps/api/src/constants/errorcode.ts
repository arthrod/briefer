import { z } from 'zod'

export enum ErrorCode {
  SUCCESS = 0,
  PARAM_ERROR = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403, 
  NOT_FOUND = 404,
  SERVER_ERROR = 500,
  
  // 业务错误码
  USER_EXISTS = 1001,
  USER_NOT_EXISTS = 1002,
  USER_DISABLED = 1003,
  PASSWORD_ERROR = 1004,
  TOKEN_EXPIRED = 1005,
  TOKEN_INVALID = 1006
}

export class BusinessError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message)
  }
}

export class ValidationError extends BusinessError {
  constructor(message: string) {
    super(ErrorCode.PARAM_ERROR, message)
  }
}

export class AuthError extends BusinessError {
  constructor(message: string) {
    super(ErrorCode.UNAUTHORIZED, message) 
  }
}
