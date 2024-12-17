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

export default function mfRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

  router.use('/chat', chatRouter(socketServer))
  router.use('/user', userRouter)
  router.use('/upload', uploadRouter)
  router.use('/run-all', runAllRouter())
  router.use('/resource', resourceRouter)
  router.use('/schema', schemaRouter())
  router.use('/documents', documentsRouter)
  
  // 初始化后台任务
  initializeTasks()

  return router
}
