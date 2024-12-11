import { NextFunction, Request, Response, Router } from 'express'
import { authenticationMiddleware } from '../../auth/token.js'
import { CONFIG } from '../chat/config/constants.js'
import { getMockSession } from '../chat/services/mock.js'
import { schemaController } from './controller.js'

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (CONFIG.USE_TEST_AUTH) {
    req.session = getMockSession()
    return next()
  }
  return authenticationMiddleware(req, res, next)
}
const createSchemaRouter = () => {
  const router = Router()
  router.use(authMiddleware)

  router.post('/table/list', schemaController.getSchemaList.bind(schemaController))
  router.post('/table/columns', schemaController.getTableColumns.bind(schemaController))
  return router
}

export default createSchemaRouter
