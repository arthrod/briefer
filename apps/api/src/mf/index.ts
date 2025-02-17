import { Router } from 'express'
import { IOServer } from '../websocket/index.js'
import chatRouter from './chat/index.js'
import userRouter from './user/index.js'
import uploadRouter from './upload/index.js'
import resourceRouter from './resource/index.js'
import { initializeTasks } from './chat/task/tasks.js'
import runAllRouter from './runall/index.js'
import schemaRouter from './schema/index.js'
import documentsRouter from './documents/index.js'
import codeRouter from './code/index.js'

/**
 * Creates and configures an Express router with various sub-routers for API endpoints.
 *
 * This function sets up an Express router with merged parameters and registers several sub-routers to handle
 * different routes:
 * - `/chat`: Configured with the chat router using the provided socket server for WebSocket integration.
 * - `/user`: Configured with the user router.
 * - `/upload`: Configured with the upload router.
 * - `/run-all`: Configured with the run-all router using the provided socket server.
 * - `/resource`: Configured with the resource router.
 * - `/schema`: Configured with the schema router.
 * - `/documents`: Configured with the documents router using the provided socket server.
 * - `/code`: Configured with the code router.
 *
 * Additionally, the function initializes background tasks by calling `initializeTasks()`.
 *
 * @param socketServer - The IOServer instance for enabling WebSocket communications.
 * @returns The fully configured Express router.
 */
export default function mfRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

  router.use('/chat', chatRouter(socketServer))
  router.use('/user', userRouter)
  router.use('/upload', uploadRouter)
  router.use('/run-all', runAllRouter(socketServer))
  router.use('/resource', resourceRouter)
  router.use('/schema', schemaRouter())
  router.use('/documents', documentsRouter(socketServer))
  router.use('/code', codeRouter)
  
  
  // 初始化后台任务
  initializeTasks()

  return router
}
