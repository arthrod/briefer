import { Router } from 'express'
import createSchemaRouter from './routes.js'

const schemaRouter = () => {
  const router = Router()

  router.use('/', createSchemaRouter())

  return router
}

export default schemaRouter
