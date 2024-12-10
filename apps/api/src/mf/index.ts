import { Router } from 'express'
import { IOServer } from '../websocket/index.js'
import chatRouter from './chat/index.js'
import userRouter from './user/index.js'
import uploadRouter from './upload/index.js'
import { initializeTasks } from './tasks.js'
import runAllRouter from './runall/index.js'

export default function mfRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

  router.use('/chat', chatRouter(socketServer))
  router.use('/user', userRouter)
  router.use('/upload', uploadRouter)
  router.use('/run-all', runAllRouter())

  // 初始化后台任务
  initializeTasks()

  return router
}
