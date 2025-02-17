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
 * Constructs a success API response.
 *
 * This function generates a standardized API response object for successful operations.
 * It sets the response code to `ErrorCode.SUCCESS`, includes the provided data payload,
 * and assigns a custom success message. If no message is provided, it defaults to "操作成功".
 *
 * @param data - The data payload to include in the response.
 * @param msg - An optional success message (defaults to "操作成功").
 * @returns A standardized ApiResponse object containing a success code, message, and the provided data.
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
 * Creates a failure API response.
 *
 * This function returns an API response object that represents an error condition. The response includes the provided
 * error code and descriptive error message, and it explicitly sets the data field to null.
 *
 * @param code - The error code indicating the type or category of the failure.
 * @param msg - A descriptive message explaining the error.
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
 * Processes a Zod validation error by extracting its first error message, logging the error,
 * and returning a structured API response indicating a parameter error.
 *
 * If the first error does not contain a message, the default message "参数校验失败" is used.
 *
 * @param error - The ZodError instance containing one or more validation errors.
 * @returns An ApiResponse object with an error code for parameter errors, the extracted error
 *          message, and null data.
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
 * Handles an error by logging it and returning a standardized API failure response.
 *
 * This function logs the provided error and message using the Logger, then returns an API response
 * indicating a server error by invoking the `fail` function with a server error code. It is typically
 * used to catch exceptions and ensure consistent error responses in the API.
 *
 * @param error - The error object or message to be logged
 * @param msg - A custom error message to return; defaults to '服务器内部错误'
 * @returns An API response object with a server error code and null data
 */
export function handleError(error: any, msg = '服务器内部错误'): ApiResponse<null> {
  Logger.error(msg, error)
  return fail(ErrorCode.SERVER_ERROR, msg)
}

/**
 * Sends an API response with the appropriate HTTP status.
 *
 * This function uses the provided Express Response object to send a JSON response constructed
 * from an ApiResponse object. It sets the HTTP status code to 200 if the response code indicates
 * success (i.e., ErrorCode.SUCCESS), or 400 otherwise.
 *
 * @param res - The Express Response object used to send the response.
 * @param response - The ApiResponse object containing the status code, message, and data.
 * @returns The updated Express Response object after sending the JSON response.
 */
export function sendResponse(res: Response, response: ApiResponse) {
  let httpStatus = 200;
  if (response.code !== ErrorCode.SUCCESS) {
    httpStatus = 400;
  }
  
  return res.status(httpStatus).json(response);
}
