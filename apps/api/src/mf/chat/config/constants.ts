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

  // 聊天状态
  CHAT_STATUS: {
    START: 1,      // 开始
    CHATTING: 2,   // 对话中
    COMPLETED: 3,  // 已完成
    FAILED: 4,     // 失败
  },

  // 聊天类型
  CHAT_TYPE: {
    RAG: 1,      // RAG对话
    REPORT: 2,   // 报告对话
  },

  // 角色类型
  SPEAKER_TYPE: {
    USER: 'user',       // 用户
    ASSISTANT: 'assistant', // AI助手
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

  // 错误码
  ERROR_CODES: {
    SUCCESS: 0,           // 成功
    VALIDATION_ERROR: 400,  // 验证错误
    AUTH_ERROR: 401,      // 认证错误
    FORBIDDEN: 403,       // 禁止
    NOT_FOUND: 404,       // 未找到
    INTERNAL_SERVER_ERROR: 500,    // 服务器错误
    DATABASE_ERROR: 501,   // 数据库错误
    API_ERROR: 502,        // API错误
    TIMEOUT_ERROR: 504,   // 超时错误
  },

  // 错误消息
  ERROR_MESSAGES: {
    VALIDATION_ERROR: '请求参数错误',
    AUTH_ERROR: '认证失败或无权限',
    FORBIDDEN: '禁止访问',
    NOT_FOUND: '资源不存在',
    INTERNAL_SERVER_ERROR: '服务器内部错误',
    TIMEOUT_ERROR: '请求超时',
  },

  // 日志相关
  LOG: {
    LEVEL: process.env['LOG_LEVEL'] ?? 'info',
    MAX_SIZE: 10485760, // 10MB
    MAX_FILES: 5,
  },
} as const
