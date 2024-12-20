import { Router } from 'express'
import createRunAllRouter from './routes.js'
import { IOServer } from '../../websocket/index.js'

const runAllRouter = (socketServer: IOServer) => {
  const router = Router()

  router.use('/', createRunAllRouter(socketServer))

  return router
}

export default runAllRouter
