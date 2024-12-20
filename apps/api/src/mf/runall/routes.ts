import { NextFunction, Request, Response, Router } from 'express'
import { authenticationMiddleware } from '../../auth/token.js'
import { CONFIG } from '../chat/config/constants.js'
import { getMockSession } from '../chat/services/mock.js'
import { RunAllController } from './controller.js'
import { IOServer } from '../../websocket/index.js'

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (CONFIG.USE_TEST_AUTH) {
    req.session = getMockSession()
    return next()
  }
  return authenticationMiddleware(req, res, next)
}
const createRunAllRouter = (socketServer: IOServer) => {
  const router = Router()
  router.use(authMiddleware)
  const runAllController = new RunAllController(socketServer)


  router.post('/list', runAllController.getRunAllList.bind(runAllController))
  router.post('/run', runAllController.createRunAll.bind(runAllController))
  router.post('/status', runAllController.queryStatus.bind(runAllController))
  router.post('/stop', runAllController.stop.bind(runAllController))
  router.post('/approve', runAllController.approve.bind(runAllController))
  router.get('/report/download', runAllController.download.bind(runAllController))
  return router
}

export default createRunAllRouter
