import { Response } from 'express'
import { ErrorCode } from '../constants/errorcode.js'
import { z } from 'zod'
import { Logger } from './logger.js'

export interface ApiResponse<T = any> {
  code: number
  msg: string
  data: T
}

/**
 * Creates an ApiResponse object indicating a successful operation.
 *
 * This function packages the provided data into a standardized ApiResponse structure,
 * using a success code and a message that defaults to '操作成功' unless a custom message is supplied.
 *
 * @param data - The payload to be included in the response.
 * @param msg - Optional. A custom success message. Defaults to '操作成功' if not provided.
 * @returns An ApiResponse object containing the success code, message, and data payload.
 */
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

/**
 * Constructs an API failure response.
 *
 * This function creates and returns an object conforming to the ApiResponse interface.
 * The response includes the provided error code, a descriptive error message, and a null data field.
 *
 * @param code - The error code representing the type of failure.
 * @param msg - A descriptive error message explaining the failure.
 * @returns An ApiResponse object with the specified error code, message, and null data.
 */
export function fail(code: ErrorCode, msg: string): ApiResponse<null> {
  return {
    code,
    msg,
    data: null
  }
}

/**
 * Handles a Zod validation error by logging it and returning a standardized API response.
 *
 * This function extracts the first validation error message from the provided Zod error.
 * If no message is found, it defaults to "参数校验失败". The error is logged, and an
 * ApiResponse is returned with a parameter error code, the extracted (or default) message,
 * and `null` data.
 *
 * @param error - The Zod error object containing validation errors.
 * @returns An ApiResponse object with a parameter error code, an appropriate error message,
 *          and `null` data.
 */
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

/**
 * Handles a general error by logging it and returning a standardized server error API response.
 *
 * @param error - The error object to be handled.
 * @param msg - An optional message to log and include in the response (default is "服务器内部错误").
 * @returns A standardized API response indicating a server error, with a null data field.
 */
export function handleError(error: any, msg = '服务器内部错误'): ApiResponse<null> {
  Logger.error(msg, error)
  return fail(ErrorCode.SERVER_ERROR, msg)
}

/**
 * Sends an API response as a JSON object using the given Express Response.
 *
 * The function determines the HTTP status code based on the API response's code:
 * - A 200 status is used if the response indicates success (`ErrorCode.SUCCESS`).
 * - A 400 status is used otherwise.
 *
 * @param res - The Express Response object to send the API response.
 * @param response - The API response containing the status code, message, and data payload.
 * @returns The result of sending the response with the specified HTTP status.
 */
export function sendResponse(res: Response, response: ApiResponse) {
  let httpStatus = 200;
  if (response.code !== ErrorCode.SUCCESS) {
    httpStatus = 400;
  }
  
  return res.status(httpStatus).json(response);
}
