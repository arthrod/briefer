import { Router } from 'express'
import { chatController } from './controllers/chat.controller.js'
import { authMiddleware } from './controllers/middleware.js'
import { IOServer } from '../../websocket/index.js'

const chatRouter = (socketServer: IOServer) => {
  const router = Router()

  // 应用认证中间件
  router.use(authMiddleware)

  // 聊天相关路由
  router.post('/create', chatController.createChat.bind(chatController))
  router.get('/list', chatController.getChatList.bind(chatController))
  router.post('/update', chatController.updateChat.bind(chatController))
  router.post('/delete', chatController.deleteChat.bind(chatController))
  router.post('/round/create', chatController.createChatRound.bind(chatController))
  router.get('/detail', chatController.getChatDetail.bind(chatController))
  router.post('/relation/check', chatController.checkRelation.bind(chatController))
  router.get('/status', chatController.getChatStatus.bind(chatController))
  router.post('/stop', chatController.stopChat.bind(chatController))
  router.post('/title/update', chatController.updateTitle.bind(chatController))

  return router
}

export default chatRouter
export * from './controllers/chat.controller.js'
export * from './services/chat.service.js'
export * from './types/errors.js'
