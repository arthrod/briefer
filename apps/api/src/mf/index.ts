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
 * Creates and configures an Express router for the microfrontend API.
 *
 * This function instantiates an Express router with merged route parameters enabled
 * and sets up several sub-routes for different functionalities:
 * - `/chat` for chat operations (integrated with real-time features via the provided IOServer)
 * - `/user` for user management
 * - `/upload` for file uploads
 * - `/run-all` for batch operations (integrated with the IOServer)
 * - `/resource` for resource handling
 * - `/schema` for schema-related operations
 * - `/documents` for document processing (integrated with the IOServer)
 * - `/code` for code-related operations
 *
 * It also initializes background tasks necessary for the application.
 *
 * @param socketServer - An IOServer instance used to provide WebSocket capabilities to certain routes.
 * @returns The configured Express router instance.
 *
 * @example
 * const socketServer = new IOServer(httpServer);
 * const router = mfRouter(socketServer);
 * app.use('/api', router);
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
