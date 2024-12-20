
export enum ErrorCode {
  SUCCESS = 0,
  PARAM_ERROR = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403, 
  NOT_FOUND = 404,
  SERVER_ERROR = 500,
  DATABASE_ERROR= 501,   // 数据库错误
  API_ERROR= 502,        // API错误
  TIMEOUT_ERROR= 504,   // 超时错误
  
  // 业务错误码
  USER_EXISTS = 1001,
  USER_NOT_EXISTS = 1002,
  USER_DISABLED = 1003,
  PASSWORD_ERROR = 1004,
  TOKEN_EXPIRED = 1005,
  TOKEN_INVALID = 1006,
  FILE_TOO_LARGE = 1007
}

export enum ErrorMessage {
  VALIDATION_ERROR= '请求参数错误',
  AUTH_ERROR= '认证失败或无权限',
  FORBIDDEN= '禁止访问',
  NOT_FOUND= '资源不存在',
  INTERNAL_SERVER_ERROR= '服务器内部错误',
  TIMEOUT_ERROR= '请求超时',
};

