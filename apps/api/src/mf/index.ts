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
 * Creates and configures an Express router with modular sub-routes for API endpoints.
 *
 * The router is instantiated with merged parameters and sets up the following sub-routes:
 * - `/chat`: Uses the chat router, initialized with the provided socket server.
 * - `/user`: Uses the user router.
 * - `/upload`: Uses the upload router.
 * - `/run-all`: Uses the run-all router, initialized with the socket server.
 * - `/resource`: Uses the resource router.
 * - `/schema`: Uses the schema router.
 * - `/documents`: Uses the documents router, initialized with the socket server.
 * - `/code`: Uses the code router.
 *
 * Additionally, background tasks are initialized by invoking `initializeTasks()`.
 *
 * @param socketServer - The IOServer instance providing WebSocket functionality for applicable routes.
 * @returns The configured Express router instance.
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
