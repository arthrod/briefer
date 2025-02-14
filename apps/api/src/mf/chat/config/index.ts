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
 * Validates the configuration object.
 *
 * This function ensures that required configuration parameters meet their constraints:
 * - `AI_AGENT_URL` must be provided.
 * - `AI_AGENT_TIMEOUT` must be greater than 0.
 * - `CACHE.CHAT_DETAIL_CACHE_DURATION` must be non-negative.
 *
 * @param config - The configuration object to validate.
 * @throws ValidationError if any of the validation conditions are not met.
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