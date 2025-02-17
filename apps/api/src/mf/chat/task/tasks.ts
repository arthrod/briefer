import { startTitleSummarizationTask } from './title-summarizer.js'
import { logger } from '../../../logger.js'

/**
 * Initializes background tasks.
 *
 * This function logs an informational message to indicate that background tasks are being initialized,
 * then proceeds to start the title summarization task by invoking `startTitleSummarizationTask`.
 *
 * @remarks
 * This setup is typically used during application startup to ensure that background processes, such as
 * title summarization, are initiated correctly.
 */
export function initializeTasks() {
  logger().info('Initializing background tasks')
  startTitleSummarizationTask()
}
