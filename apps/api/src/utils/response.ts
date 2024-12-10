import { Response } from 'express'
import { ErrorCode } from '../constants/errorcode.js'
import { z } from 'zod'
import { Logger } from './logger.js'

export interface ApiResponse<T = any> {
  code: number
  msg: string
  data: T
}

export function success<T>(data: T, msg = '操作成功'): ApiResponse<T> {
  return {
    code: ErrorCode.SUCCESS,
    msg,
    data
  }
}

export const createSuccessResponse = <T>(data: T, msg: string = '操作成功'): ApiResponse<T> => ({
  code: ErrorCode.SUCCESS,
  data,
  msg,
})

export const sendSuccess = <T>(res: Response, data: T, msg?: string) => {
  return res.json(createSuccessResponse(data, msg))
}

export function fail(code: ErrorCode, msg: string): ApiResponse<null> {
  return {
    code,
    msg,
    data: null
  }
}

export function handleZodError(error: z.ZodError): ApiResponse<null> {
  const firstError = error.errors[0]
  const errorMessage = firstError?.message || '参数校验失败'
  
  Logger.error('参数校验失败', error)
  
  return {
    code: ErrorCode.PARAM_ERROR,
    msg: errorMessage,
    data: null
  }
}

export function handleError(error: any, msg = '服务器内部错误'): ApiResponse<null> {
  Logger.error(msg, error)
  return fail(ErrorCode.SERVER_ERROR, msg)
}

export function sendResponse(res: Response, response: ApiResponse) {
  let httpStatus = 200;
  if (response.code !== ErrorCode.SUCCESS) {
    httpStatus = 400;
  }
  
  return res.status(httpStatus).json(response);
}
