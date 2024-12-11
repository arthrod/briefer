import { Router } from 'express'
import createRunAllRouter from './routes.js'

const runAllRouter = () => {
  const router = Router()

  router.use('/', createRunAllRouter())

  return router
}

export default runAllRouter
