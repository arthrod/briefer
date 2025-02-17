import fetch, { Response as FetchResponse } from 'node-fetch'
import { CONFIG } from '../config/constants.js'
import { TimeoutError, APIError } from '../types/errors.js'
import { ErrorCode } from '../../../constants/errorcode.js'

/**
 * Performs an HTTP fetch request with a specified timeout.
 *
 * This function sends a fetch request to the provided URL using the specified options and enforces a timeout
 * by utilizing an AbortController. If the fetch does not complete within the given timeout duration, the request
 * is aborted and a TimeoutError is thrown. Additionally, if a response is received but indicates a failure (i.e.,
 * response.ok is false), an APIError is thrown with the corresponding status code.
 *
 * @param url - The URL to which the request is sent.
 * @param options - The fetch options, which may include headers, method, and a body. The body can be of type string, URLSearchParams, Buffer, or FormData.
 * @param timeout - The maximum time in milliseconds to wait for the request to complete before aborting. Defaults to CONFIG.AI_AGENT_TIMEOUT.
 * @returns A promise resolving to a FetchResponse if the request is successful.
 * @throws TimeoutError - If the request exceeds the specified timeout.
 * @throws APIError - If the response status indicates a failure.
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
 * Adds an active request's AbortController to the active requests map.
 *
 * This function stores the provided AbortController in the global active requests map using the specified key.
 * It enables the tracking and management of ongoing requests that can be aborted later.
 *
 * @param key - A unique identifier for the active request.
 * @param controller - The AbortController instance controlling the active request.
 */
export function addActiveRequest(key: string, controller: AbortController): void {
  activeRequests.set(key, controller)
}

/**
 * Removes the active request associated with the specified key from the active requests map.
 *
 * This function deletes the entry for the given key in the activeRequests map. If the key does not exist,
 * the function performs no action.
 *
 * @param key - The key identifying the active request to remove.
 */
export function removeActiveRequest(key: string): void {
  activeRequests.delete(key)
}

/**
 * Aborts an active request associated with the given key.
 *
 * This function retrieves the AbortController instance from the active requests map
 * corresponding to the provided key. If found, the request is aborted using the controller,
 * and the key is subsequently removed from the active requests map.
 *
 * @param key - A unique string identifier for the active request to abort.
 * @returns void
 */
export function abortRequest(key: string): void {
  const controller = activeRequests.get(key)
  if (controller) {
    controller.abort()
    removeActiveRequest(key)
  }
}

/**
 * Aborts all active HTTP requests.
 *
 * This function iterates over the `activeRequests` map, aborting each request by calling the `abort()` method on its associated
 * `AbortController` and then removing the request entry using `removeActiveRequest`.
 *
 * @remarks
 * Use this function to cancel all ongoing HTTP requests, for example during component unmounting or when a global cancellation
 * of requests is required.
 */
export function abortAllRequests(): void {
  activeRequests.forEach((controller, key) => {
    controller.abort()
    removeActiveRequest(key)
  })
}

/**
 * Generates a unique request key by concatenating the chat ID and an optional round ID.
 *
 * If the round ID is provided, the function returns a string in the format "chatId:roundId". Otherwise, it returns the chat ID.
 *
 * @param chatId - The unique identifier of the chat.
 * @param roundId - An optional identifier for the round within the chat.
 * @returns The generated request key.
 */
export function getRequestKey(chatId: string, roundId?: string): string {
  return roundId ? `${chatId}:${roundId}` : chatId
}

/**
 * Retries the execution of an asynchronous function with exponential backoff.
 *
 * Executes the provided asynchronous function and, if it fails, waits for a specified delay
 * before retrying. The delay doubles after each attempt. If the operation fails after all
 * retry attempts, the function throws the last encountered error.
 *
 * @param fn - The asynchronous function to execute.
 * @param retries - The maximum number of retry attempts. Defaults to CONFIG.SSE.MAX_RETRIES.
 * @param delay - The initial delay in milliseconds before retrying, which doubles after each failure. Defaults to 1000.
 * @returns A promise that resolves to the result of the asynchronous function if successful.
 *
 * @throws The error encountered on the final retry if all attempts fail.
 *
 * @example
 * ```typescript
 * const result = await retryFetch(async () => {
 *   // Perform an asynchronous operation
 *   return fetchSomeData();
 * }, 3, 1000);
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
