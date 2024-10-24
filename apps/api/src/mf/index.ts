import { Router } from 'express'
import { authenticationMiddleware } from '../auth/token.js'
import { IOServer } from '../websocket/index.js'
import chatRouter from './chat/index.js'

export default function mfRouter() {
  const router = Router({ mergeParams: true })

  router.use(
    '/chat',
    authenticationMiddleware,
    chatRouter()
  )
  return router
}
