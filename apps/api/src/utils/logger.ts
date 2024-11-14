import { logger } from '../logger.js'

interface LogData {
  [key: string]: any
}

export class Logger {
  static info(msg: string, data?: LogData) {
    logger().info({
      msg,
      data: {
        ...data,
        timestamp: new Date().toISOString()
      }
    })
  }

  static error(msg: string, error: any, data?: LogData) {
    logger().error({
      msg,
      data: {
        error,
        errorMessage: error instanceof Error ? error.message : '未知错误',
        errorStack: error instanceof Error ? error.stack : undefined,
        ...data,
        timestamp: new Date().toISOString()
      }
    })
  }

  static warn(msg: string, data?: LogData) {
    logger().warn({
      msg, 
      data: {
        ...data,
        timestamp: new Date().toISOString()
      }
    })
  }
}
