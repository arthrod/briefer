import { startTitleSummarizationTask } from './title-summarizer.js'
import { logger } from '../../../logger.js'

/**
 * Initializes background tasks.
 *
 * This function logs an informational message indicating that background tasks are being initialized
 * and then starts the title summarization task by invoking the `startTitleSummarizationTask` function.
 *
 * @remarks
 * This function serves as a centralized point for kicking off background operations. It does not handle
 * any errors or return any values.
 */
export function initializeTasks() {
  logger().info('Initializing background tasks')
  startTitleSummarizationTask()
}
