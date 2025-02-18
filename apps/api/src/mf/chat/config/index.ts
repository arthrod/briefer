import { CONFIG } from './constants.js'
import { ValidationError } from '../types/errors.js'

// 配置类型定义
export interface Config {
  USE_TEST_AUTH: boolean
  AI_AGENT_URL: string | undefined
  AI_AGENT_TIMEOUT: number
  AI_AGENT_ENDPOINTS: {
    REPORT_COMPLETIONS: string
    RAG_COMPLETIONS: string
  }
  CACHE: {
    DEFAULT_TTL: number
    KEY_PREFIX: string

    CHAT_DETAIL_CACHE_DURATION: number
    CHAT_LIST_CACHE_DURATION: number
    CHAT_STATUS_CACHE_DURATION: number
  }
}

/**
 * Validates the configuration object to ensure that it meets the required constraints.
 *
 * This function performs the following checks:
 * - Confirms that the `AI_AGENT_URL` property is provided.
 * - Ensures that `AI_AGENT_TIMEOUT` is greater than 0.
 * - Verifies that `CACHE.CHAT_DETAIL_CACHE_DURATION` is non-negative.
 *
 * @param config - The configuration object to be validated, which includes settings for the AI agent and caching.
 *
 * @throws ValidationError if `AI_AGENT_URL` is missing.
 * @throws ValidationError if `AI_AGENT_TIMEOUT` is less than or equal to 0.
 * @throws ValidationError if `CACHE.CHAT_DETAIL_CACHE_DURATION` is negative.
 */
export function validateConfig(config: Config) {
  if (!config.AI_AGENT_URL) {
    throw new ValidationError('AI_AGENT_URL is required')
  }
  if (config.AI_AGENT_TIMEOUT <= 0) {
    throw new ValidationError('AI_AGENT_TIMEOUT must be greater than 0')
  }
  if (config.CACHE.CHAT_DETAIL_CACHE_DURATION < 0) {
    throw new ValidationError('CHAT_DETAIL_CACHE_DURATION must be non-negative')
  }
}

// 验证配置
validateConfig(CONFIG)