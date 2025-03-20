import fetch, { Response as FetchResponse } from 'node-fetch'
import { CONFIG } from '../config/constants.js'
import { TimeoutError, APIError } from '../types/errors.js'
import { ErrorCode } from '../../../constants/errorcode.js'

/**
 * Performs an HTTP fetch request with a specified timeout.
 *
 * This function sends an HTTP request using the Fetch API and enforces a timeout with an AbortController.
 * If the request does not complete before the timeout expires, the request is aborted and a TimeoutError is thrown.
 * Additionally, if the HTTP response indicates failure (i.e., response.ok is false), an APIError is thrown with the response status.
 *
 * @param url - The URL to which the request is sent.
 * @param options - The request options, including an optional body.
 * @param timeout - The maximum time to wait (in milliseconds) before aborting the request. Defaults to CONFIG.AI_AGENT_TIMEOUT.
 * @returns The FetchResponse if the request is successful.
 *
 * @throws APIError - Thrown when the response status indicates an error.
 * @throws TimeoutError - Thrown when the request times out.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { body?: string | URLSearchParams | Buffer | FormData },
  timeout: number = CONFIG.AI_AGENT_TIMEOUT
): Promise<FetchResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new APIError(
        `API request failed with status ${response.status}`,
        ErrorCode.API_ERROR,
        response.status
      )
    }

    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request timeout after ${timeout}ms`)
    }
    throw error
  }
}

// 活跃请求管理
export const activeRequests = new Map<string, AbortController>()

/**
 * Adds an active request to the active requests map.
 *
 * Associates the given AbortController with a unique request key, allowing for tracking
 * and management of the request. This facilitates the cancellation of the request when needed.
 *
 * @param key - The unique identifier for the active request.
 * @param controller - The AbortController instance that manages cancellation of the active request.
 */
export function addActiveRequest(key: string, controller: AbortController): void {
  activeRequests.set(key, controller)
}

/**
 * Removes an active request from the active requests map.
 *
 * This function deletes the active request associated with the provided key from the global `activeRequests` map.
 * If the key does not exist, the operation is silently ignored.
 *
 * @param key - The unique identifier of the active request to remove.
 */
export function removeActiveRequest(key: string): void {
  activeRequests.delete(key)
}

/**
 * Aborts an active request associated with the given key.
 *
 * This function retrieves the AbortController mapped to the provided key from the active requests collection.
 * If an AbortController is found, it aborts the ongoing request by calling its `abort()` method and then removes
 * the request entry from the activeRequests map to prevent memory leaks.
 *
 * @param key - A unique identifier for the active request to be aborted.
 *
 * @example
 * // Abort the request associated with 'chat123'
 * abortRequest('chat123');
 */
export function abortRequest(key: string): void {
  const controller = activeRequests.get(key)
  if (controller) {
    controller.abort()
    removeActiveRequest(key)
  }
}

/**
 * Aborts and removes all active requests.
 *
 * This function iterates through every active request stored in the global activeRequests map.
 * It calls the abort method on each request’s AbortController to terminate the request and then removes
 * the request from the activeRequests map by invoking removeActiveRequest.
 *
 * @remarks
 * Use this function to cancel all pending or in-progress HTTP requests associated with the activeRequests map.
 *
 * @returns Nothing.
 */
export function abortAllRequests(): void {
  activeRequests.forEach((controller, key) => {
    controller.abort()
    removeActiveRequest(key)
  })
}

/**
 * Generates a unique request key based on the provided chat ID and an optional round ID.
 *
 * If a round ID is provided, the key is formatted as "chatId:roundId".
 * Otherwise, the key will be the chat ID.
 *
 * @param chatId - The identifier for the chat.
 * @param roundId - An optional identifier for the specific round.
 * @returns The generated request key.
 */
export function getRequestKey(chatId: string, roundId?: string): string {
  return roundId ? `${chatId}:${roundId}` : chatId
}

/**
 * Retries an asynchronous function with an exponential backoff delay.
 *
 * This function executes the provided promise-returning function, `fn`. If `fn` throws an error,
 * the function waits for a given delay (in milliseconds), doubles the delay for subsequent attempts,
 * and retries executing `fn`. It continues retrying until the specified number of retries is exhausted,
 * at which point it throws the last error encountered.
 *
 * @param fn - The asynchronous function to execute.
 * @param retries - The number of retry attempts allowed. Defaults to CONFIG.SSE.MAX_RETRIES.
 * @param delay - The initial delay in milliseconds before retrying, which doubles on each failure. Defaults to 1000.
 * @returns A promise that resolves with the return value of `fn`.
 *
 * @throws Will propagate the error thrown by `fn` if all retry attempts are exhausted.
 *
 * @example
 * ```typescript
 * const result = await retryFetch(() => fetchData(), 3, 500);
 * console.log(result);
 * ```
 */
export async function retryFetch<T>(
  fn: () => Promise<T>,
  retries: number = CONFIG.SSE.MAX_RETRIES,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries === 0) throw error
    await new Promise(resolve => setTimeout(resolve, delay))
    return retryFetch(fn, retries - 1, delay * 2)
  }
}
