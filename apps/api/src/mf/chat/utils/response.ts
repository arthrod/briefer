import { Response } from 'express'

export interface ApiResponse<T = any> {
  code: number
  data: T
  msg: string
}

export const createSuccessResponse = <T>(data: T, msg: string = '操作成功'): ApiResponse<T> => ({
  code: 0,
  data,
  msg,
})

export const sendSuccess = <T>(res: Response, data: T, msg?: string) => {
  return res.json(createSuccessResponse(data, msg))
}
