import fetch, { Response as FetchResponse } from 'node-fetch'
import { CONFIG } from '../config/constants.js'
import { TimeoutError, APIError, ERROR_CODES } from '../types/errors.js'

// 带超时的fetch请求
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
        ERROR_CODES.API_ERROR,
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

// 添加活跃请求
export function addActiveRequest(key: string, controller: AbortController): void {
  activeRequests.set(key, controller)
}

// 移除活跃请求
export function removeActiveRequest(key: string): void {
  activeRequests.delete(key)
}

// 中止请求
export function abortRequest(key: string): void {
  const controller = activeRequests.get(key)
  if (controller) {
    controller.abort()
    removeActiveRequest(key)
  }
}

// 中止所有请求
export function abortAllRequests(): void {
  activeRequests.forEach((controller, key) => {
    controller.abort()
    removeActiveRequest(key)
  })
}

// 获取请求键
export function getRequestKey(chatId: string, roundId?: string): string {
  return roundId ? `${chatId}:${roundId}` : chatId
}

// 重试请求
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
