import { Router } from 'express'
import createChatRouter from './routes/chat.routes.js'
import { IOServer } from '../../websocket/index.js'

const chatRouter = (socketServer: IOServer) => {
  const router = Router()
  
  // Mount chat routes with socketServer
  router.use('/', createChatRouter(socketServer))

  return router
}

export default chatRouter
export * from './controllers/chat.controller.js'
export * from './services/chat.service.js'
export * from './types/errors.js'
