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
 * Generates a successful API response.
 *
 * This function creates an API response object with a pre-defined success code,
 * a customizable message, and the supplied data. The default message is '操作成功'.
 *
 * @template T - The type of the response data.
 * @param data - The data payload to include in the response.
 * @param msg - An optional success message; defaults to '操作成功'.
 * @returns An ApiResponse object containing the success code, message, and data.
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
 * Creates a failure API response object with the specified error code and message.
 *
 * @param code - The error code representing the specific error condition.
 * @param msg - A descriptive error message explaining the failure.
 * @returns An ApiResponse object with the given error code, message, and a null data field.
 *
 * @example
 * const errorResponse = fail(ErrorCode.NotFound, "Resource not found");
 */
export function fail(code: ErrorCode, msg: string): ApiResponse<null> {
  return {
    code,
    msg,
    data: null
  }
}

/**
 * Processes a Zod validation error by extracting the first error message, logging the details, and returning a standardized API response.
 *
 * If the extracted error message is missing, it defaults to '参数校验失败'. The resulting response contains
 * a parameter error code, the error message, and a null data field.
 *
 * @param error - The ZodError object containing validation errors.
 * @returns An ApiResponse with the error code for parameter errors, the extracted or default error message, and null data.
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
 * Handles a general error by logging it and returning a standardized API server error response.
 *
 * This function logs the provided error along with a custom or default error message using a Logger,
 * and then returns an API response indicating a server error via the `fail` function. The response
 * includes an error code for server errors and a null data payload.
 *
 * @param error - The error object or value that occurred.
 * @param msg - An optional error message to be logged and returned (default: '服务器内部错误').
 * @returns An API response object with a null data payload representing a server error.
 */
export function handleError(error: any, msg = '服务器内部错误'): ApiResponse<null> {
  Logger.error(msg, error)
  return fail(ErrorCode.SERVER_ERROR, msg)
}

/**
 * Sends an API response using the provided Express response object.
 *
 * This function sends a JSON response to the client by automatically determining the appropriate HTTP status
 * code. It sets the status to 200 if the response code indicates success (i.e., if response.code equals ErrorCode.SUCCESS);
 * otherwise, it sets the status to 400.
 *
 * @param res - The Express response object to send the HTTP response.
 * @param response - The API response object containing the code, message, and data.
 * @returns The Express response object after sending the JSON response.
 */
export function sendResponse(res: Response, response: ApiResponse) {
  let httpStatus = 200;
  if (response.code !== ErrorCode.SUCCESS) {
    httpStatus = 400;
  }
  
  return res.status(httpStatus).json(response);
}
