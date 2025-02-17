import fetch, { Response as FetchResponse } from 'node-fetch'
import { CONFIG } from '../config/constants.js'
import { TimeoutError, APIError } from '../types/errors.js'
import { ErrorCode } from '../../../constants/errorcode.js'

/**
 * Performs an HTTP fetch request with a specified timeout.
 *
 * This function initiates a fetch request and automatically aborts it if it does not complete
 * within the specified timeout duration. It uses an AbortController to cancel the request and
 * throws a TimeoutError if the request is aborted due to a timeout. Additionally, if the HTTP
 * response is not successful (i.e., `response.ok` is false), an APIError is thrown with the response status.
 *
 * @param url - The URL to send the request to.
 * @param options - The options for the fetch request, including HTTP method, headers, body, etc.
 * @param timeout - The maximum number of milliseconds to wait before aborting the request.
 *                  Defaults to CONFIG.AI_AGENT_TIMEOUT.
 * @returns A promise that resolves with the fetch response if the request is successful.
 *
 * @throws APIError if the response status indicates a failure.
 * @throws TimeoutError if the request exceeds the specified timeout duration.
 *
 * @example
 * ```typescript
 * try {
 *   const response = await fetchWithTimeout('https://api.example.com/data', { method: 'GET' }, 5000);
 *   // Process the successful response here
 * } catch (error) {
 *   // Handle errors e.g. TimeoutError or APIError
 * }
 * ```
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
 * 添加活跃请求到内部映射中。
 *
 * 本函数将指定的 AbortController 对象与提供的键关联，并添加到活跃请求映射中，以便后续进行请求管理或中止操作。
 *
 * @param key - 请求的唯一标识符，在活跃请求集合中使用该键进行引用。
 * @param controller - 用于控制请求的 AbortController 实例，支持请求中止功能。
 */
export function addActiveRequest(key: string, controller: AbortController): void {
  activeRequests.set(key, controller)
}

/**
 * Removes an active request from the tracking map.
 *
 * This function deletes the active request associated with the given key from the internal
 * request tracking map. It is typically called when a request has completed or is no longer needed.
 *
 * @param key - A unique identifier for the active request to be removed.
 */
export function removeActiveRequest(key: string): void {
  activeRequests.delete(key)
}

/**
 * Aborts the active request associated with the specified key.
 *
 * This function retrieves the AbortController from the active requests map based on the provided key. If an
 * AbortController is found, it aborts the associated request and removes the entry from the active requests map.
 * If no active request corresponds to the key, the function does nothing.
 *
 * @param key - The unique identifier for the active request to be aborted.
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
 * This function iterates over all entries in the activeRequests map, aborts each request using its associated AbortController,
 * and removes the request from the map. This ensures that all ongoing operations managed by the activeRequests map are terminated.
 *
 * @example
 * // Abort all ongoing HTTP requests.
 * abortAllRequests();
 */
export function abortAllRequests(): void {
  activeRequests.forEach((controller, key) => {
    controller.abort()
    removeActiveRequest(key)
  })
}

/**
 * Generates a request key based on a chat identifier and an optional round identifier.
 *
 * If a round identifier is provided, this function returns a string in the format "chatId:roundId".
 * Otherwise, it simply returns the chatId.
 *
 * @param chatId - The identifier for the chat.
 * @param roundId - An optional identifier for a specific round.
 * @returns The generated request key.
 */
export function getRequestKey(chatId: string, roundId?: string): string {
  return roundId ? `${chatId}:${roundId}` : chatId
}

/**
 * Retries an asynchronous operation with exponential backoff.
 *
 * This function attempts to execute the provided asynchronous function `fn` and, if it fails, waits for a specified
 * delay before retrying the operation. The delay doubles after each failed attempt, and the process is repeated until
 * the maximum number of retries is reached. If all retry attempts fail, the function throws the last encountered error.
 *
 * @param fn - A function that returns a promise representing the asynchronous operation to be executed.
 * @param retries - The number of retry attempts. Defaults to CONFIG.SSE.MAX_RETRIES.
 * @param delay - The initial delay in milliseconds before retrying the operation, which doubles after each attempt. Defaults to 1000.
 * @returns A promise that resolves with the result of the successful operation.
 *
 * @throws Will throw an error if all retry attempts are exhausted.
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
