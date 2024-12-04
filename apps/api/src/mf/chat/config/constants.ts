export const CONFIG = {
  // 认证相关
  USE_TEST_AUTH: false, // 测试模式开关，true 时使用测试数据，false 时使用正常认证

  // AI Agent相关
  AI_AGENT_URL: process.env['AI_AGENT_URL'],
  AI_AGENT_TIMEOUT: Number(process.env['AI_AGENT_TIMEOUT']) ?? 15000,
  AI_AGENT_ENDPOINTS: {
    REPORT_COMPLETIONS: '/v1/ai/chat/report/completions',
    RAG_COMPLETIONS: '/v1/ai/chat/rag/completions',
    DATA_COMPLETIONS: '/v1/ai/chat/data/completions',
    RELATION_CHECK: '/v1/ai/chat/relation',
    SUMMARIZE: '/v1/ai/chat/summarize',
    STOP_CHAT: '/v1/ai/chat/stop',
  },

  // 缓存相关
  CACHE: {
    DEFAULT_TTL: 60, // 秒
    KEY_PREFIX: 'mindflow:chat',

    CHAT_DETAIL_CACHE_DURATION: 60, // 秒
    CHAT_LIST_CACHE_DURATION: 300, // 秒
    CHAT_STATUS_CACHE_DURATION: 30, // 秒
  },

  // 分页相关
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  },

  // SSE相关
  SSE: {
    RETRY_TIMEOUT: 15000,   // 重试超时时间
    KEEP_ALIVE_INTERVAL: 30000, // 保活间隔
    MAX_RETRIES: 3,        // 最大重试次数
  },

  // 日志相关
  LOG: {
    LEVEL: process.env['LOG_LEVEL'] ?? 'info',
    MAX_SIZE: 10485760, // 10MB
    MAX_FILES: 5,
  },
} as const
