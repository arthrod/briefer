import { startTitleSummarizationTask } from './title-summarizer.js'
import { logger } from '../../../logger.js'

export function initializeTasks() {
  logger().info('Initializing background tasks')
  startTitleSummarizationTask()
}
