import qs from 'querystring'
import bodyParser from 'body-parser'
import express, { NextFunction, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import cookies from 'cookie-parser'
import * as db from '@briefer/database'
import cors from 'cors'
import http from 'http'
import { pinoHttp } from 'pino-http'

import { config } from './config/index.js'
import v1Router from './v1/index.js'
import authRouter from './auth/index.js'
import { createSocketServer } from './websocket/index.js'
import { getJupyterManager } from './jupyter/index.js'
import { logger } from './logger.js'
import { setupYJSSocketServerV2 } from './yjs/v2/index.js'
import { runSchedule } from './schedule/index.js'
import { initUpdateChecker } from './update-checker.js'
import mfRouter from './mf/index.js'

const getDBUrl = async () => {
  const username = config().POSTGRES_USERNAME
  const hostname = config().POSTGRES_HOSTNAME
  const port = Number(config().POSTGRES_PORT)
  const database = config().POSTGRES_DATABASE
  const password = config().POSTGRES_PASSWORD
  const connectionLimit = config().POSTGRES_CONNECTION_LIMIT
  const poolTimeout = config().POSTGRES_POOL_TIMEOUT

  let url = `postgresql://${username}:${password}@${hostname}:${port}/${database}`

  const query: Record<string, string> = {}
  if (!Number.isNaN(connectionLimit)) {
    query['connection_limit'] = connectionLimit.toString()
  }
  if (!Number.isNaN(poolTimeout)) {
    query['pool_timeout'] = poolTimeout.toString()
  }
  const querystring = qs.stringify(query)
  if (querystring !== '') {
    url = `${url}?${querystring}`
  }

  return url
}

/**
 * Initializes and starts the main application components.
 *
 * This asynchronous function performs the following tasks:
 * - Retrieves the PostgreSQL database connection URL and initializes the database.
 * - Creates an Express application and an HTTP server.
 * - Sets up a socket server and a YJS socket server to handle real-time communication.
 * - Schedules background tasks and registers their shutdown functions.
 * - Configures middleware for logging (using pino-http), cookie parsing, CORS, and body parsing with high payload limits.
 * - Registers API routes including:
 *   - The authentication router at '/auth'.
 *   - A specific router for "mf" endpoints at '/v1/mf'.
 *   - A general API v1 router at '/v1'.
 * - Implements health check endpoints:
 *   - '/livez' returns 200 if the server is live, or 503 if the shutdown process has started.
 *   - '/readyz' returns 200 when the server is ready to accept requests, or 503 otherwise.
 * - Defines and registers an error handling middleware to log uncaught errors and respond with a 500 status code.
 * - Starts the HTTP server on port 8080 and logs the server status.
 * - Initializes a Jupyter manager and registers its shutdown function.
 * - Sets up graceful shutdown handling by defining an internal shutdown routine and attaching it to process signals ('SIGTERM' and 'SIGINT').
 *
 * @returns A Promise that resolves when the initialization process is complete.
 */
async function main() {
  const dbUrl = await getDBUrl()
  db.init(dbUrl)

  const app = express()
  const server = http.createServer(app)

  let shutdownFunctions: (() => Promise<void> | void)[] = []
  const socketServer = createSocketServer(server)
  shutdownFunctions.push(() => socketServer.shutdown())

  const stopSchedules = await runSchedule(socketServer.io)
  shutdownFunctions.push(stopSchedules)

  const yjsServerV2 = setupYJSSocketServerV2(server, socketServer.io)
  shutdownFunctions.push(() => yjsServerV2.shutdown())

  app.use(
    pinoHttp({
      logger: logger(),
      useLevel: config().NODE_ENV !== 'development' ? 'trace' : 'silent',
      genReqId: function (req) {
        req.id = req.id ?? uuidv4()
        return req.id
      },
    })
  )
  app.use(cookies())
  app.use(
    cors({
      credentials: true,
      origin: [config().FRONTEND_URL, 'https://briefer.cloud'],
    })
  )
  app.use(bodyParser.json({ limit: '50mb' }))
  app.use(
    bodyParser.urlencoded({
      limit: '50mb',
      extended: true,
      parameterLimit: 50000,
    })
  )

  app.use('/auth', authRouter(socketServer.io))
  app.use('/v1/mf', mfRouter(socketServer.io))  // 先注册具体路由
  app.use('/v1', v1Router(socketServer.io))     // 后注册通用路由
  let shuttingDown = false
  app.get('/livez', (_req, res) => {
    if (shuttingDown) {
      res.sendStatus(503)
    } else {
      res.sendStatus(200)
    }
  })

  let ready = false
  app.get('/readyz', (_req, res) => {
    if (ready) {
      res.sendStatus(200)
    } else {
      res.sendStatus(503)
    }
  })

  app.use(function onError(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
  ) {
    req.log.error({ err }, 'Uncaught error while handling request')

    // The error id is attached to `res.sentry` to be returned
    // and optionally displayed to the user for support.
    res.statusCode = 500
    res.end(res.sentry + '\n')
  })

  server.listen(8080, () => {
    logger().info('Server is running on port 8080')
  })

  const jupyterManager = getJupyterManager()
  await jupyterManager.start(socketServer.io)
  shutdownFunctions.push(() => jupyterManager.stop())

  ready = true

  // shutdownFunctions.push(await initUpdateChecker())

  let shutdownPromise: Promise<void> | null = null
  async function shutdown() {
    if (shutdownPromise) {
      return shutdownPromise
    }

    shuttingDown = true
    shutdownPromise = new Promise(async (resolve) => {
      logger().info('[shutdown] Handling shutdown')
      server.close()
      while (true) {
        try {
          await Promise.all(shutdownFunctions.map((fn) => fn()))
          break
        } catch (err) {
          logger().error({ err }, '[shutdown] Error while shutting down server')
          await new Promise((resolve) => setTimeout(resolve, 200))
          logger().info('[shutdown] Retrying shutdown handling')
        }
      }

      logger().info('[shutdown] Shutdown complete')
      resolve()
      process.exit(0)
    })

    return shutdownPromise
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  logger().error({ err }, 'Uncaught error while starting server')
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  logger().error({ err }, 'Unhandled rejection')
})

process.on('uncaughtException', (err) => {
  logger().error({ err }, 'Uncaught exception')
})
