import { CONFIG } from './constants.js'

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
  CHAT_STATUS: {
    START: number
    CHATTING: number
    COMPLETED: number
  }
}

// 验证配置
export function validateConfig(config: Config) {
  if (!config.AI_AGENT_URL) {
    throw new Error('AI_AGENT_URL is required')
  }
  if (config.AI_AGENT_TIMEOUT <= 0) {
    throw new Error('AI_AGENT_TIMEOUT must be greater than 0')
  }
  if (config.CACHE.CHAT_DETAIL_CACHE_DURATION < 0) {
    throw new Error('CHAT_DETAIL_CACHE_DURATION must be non-negative')
  }
}

// 验证配置
validateConfig(CONFIG)