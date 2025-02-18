import { startTitleSummarizationTask } from './title-summarizer.js'
import { logger } from '../../../logger.js'

/**
 * Initializes background tasks for the application.
 *
 * This function logs an informational message indicating that background tasks are being initialized,
 * and then triggers the title summarization task by invoking `startTitleSummarizationTask`.
 *
 * @remarks
 * Ensure that the logger and title summarization modules are properly configured before calling this function.
 *
 * @returns void
 */
export function initializeTasks() {
  logger().info('Initializing background tasks')
  startTitleSummarizationTask()
}
