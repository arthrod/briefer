import { fromPairs } from 'ramda'
import { prisma, confirmUser, getUserByEmail, ApiUser } from '@briefer/database'
import { Router } from 'express'
import { z } from 'zod'
import { obscureEmail } from '../emails.js'
import { comparePassword, hashPassword, isValidPassword } from '../password.js'
import properties from '../properties.js'
import { IOServer } from '../websocket/index.js'
import { callbackUrlSchema, cookieOptions } from './index.js'
import {
  authenticationMiddleware,
  createAuthToken,
  createLoginLink,
  decodeLoginToken,
} from './token.js'
import { createWorkspace } from '../workspace/index.js'
import { isWorkspaceNameValid } from '../utils/validation.js'
import { AesTools } from '../utils/AesTools.js'

type BaseAuthConfig = {
  FRONTEND_URL: string
}
/**
 * Creates and configures an Express router for handling user authentication and workspace management.
 *
 * This router sets up several endpoints:
 *
 * - **GET `/link/callback`**: Validates a login token from the query string, confirms the user, sets an authentication cookie,
 *   and redirects the client. It returns a 400 status code for invalid queries, 401 for invalid tokens, or redirects if the token has expired.
 *
 * - **POST `/sign-up/password`**: Handles user registration by ensuring setup is required, validating the payload (workspace name,
 *   user name, email, and password), and checking against existing users. On successful registration, it creates a new user and workspace
 *   within a transaction and responds with a login link and workspace details. Returns appropriate error responses if validation fails or
 *   the user already exists.
 *
 * - **POST `/sign-in/password`**: Authenticates a user based on their login name and decrypted password. It checks if the user exists,
 *   is active, and if their decrypted password matches the stored password digest. Returns a login link and obscured email on success,
 *   or a 400 status code if authentication fails.
 *
 * - **GET `/session`**: Retrieves the current user session along with their workspace roles. An optional transformation function can be
 *   applied to the user session before it is returned.
 *
 * - **GET `/logout`**: Logs out the user by clearing the authentication cookie and redirecting them to a validated callback URL.
 *
 * The router leverages Zod for input validation, Prisma for database operations, and AesTools for password decryption.
 *
 * @param socketServer - An instance of the real-time communication server (IOServer) used for workspace notifications.
 * @param config - The base authentication configuration, including the FRONTEND_URL for redirects.
 * @param transformUserSession - (Optional) A function to transform the authenticated user session before it is returned.
 * @returns A configured Express Router ready to handle authentication and workspace management routes.
 *
 * @example
 * const router = getRouter(socketServer, { FRONTEND_URL: 'https://example.com' }, transformSession);
 * app.use('/auth', router);
 */
export default function getRouter<H extends ApiUser>(
  socketServer: IOServer,
  config: BaseAuthConfig,
  transformUserSession?: (user: ApiUser) => H
) {
  const router = Router({ mergeParams: true })

  router.get('/link/callback', async (req, res) => {
    const query = z.object({ t: z.string().min(1) }).safeParse(req.query)
    if (!query.success) {
      res.status(400).end()
      return
    }

    const token = query.data.t
    const { data, isExpired } = decodeLoginToken(token)
    if (!data) {
      res.status(401).send('Invalid token')
      return
    }

    if (isExpired) {
      res.redirect(`${config.FRONTEND_URL}/auth/expired-signin?t=${token}`)
      return
    }

    await confirmUser(data.userId)

    res.cookie('token', createAuthToken(data.userId), cookieOptions)
    res.redirect(data.callback)
  })

  router.post('/sign-up/password', async (req, res) => {
    const { needsSetup } = await properties()

    if (!needsSetup) {
      res.status(400).json({
        reason: 'setup-already-done',
      })
      return
    }

    const payload = z
      .object({
        workspaceName: z.string(),
        name: z.string().trim(),
        email: z.string().trim().email(),
        password: z.string(),
      })
      .safeParse(req.body)

    if (!payload.success || !isWorkspaceNameValid(payload.data.workspaceName)) {
      res.status(400).json({
        reason: 'invalid-payload',
      })
      return
    }

    const { email, password } = payload.data
    if (!isValidPassword(password)) {
      res.status(400).json({
        reason: 'invalid-password',
      })
      return
    }

    try {
      const existingUser = await getUserByEmail(email)
      if (existingUser) {
        res.status(400).json({
          reason: 'user-exists',
        })
        return
      }

      const { workspace, user } = await prisma().$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            name: payload.data.name,
            loginName: payload.data.name,
            passwordDigest: await hashPassword(password),
          }
        })

        const workspace = await createWorkspace(
          user,
          {
            name: payload.data.workspaceName,
          },
          socketServer,
          tx
        )

        return { workspace, user }
      })

      const loginLink = createLoginLink(user.id, config.FRONTEND_URL)

      res.status(201).json({ workspace, loginLink })
    } catch (err) {
      req.log.error({ err }, 'Failed to handle sign-up request')
      res.sendStatus(500)
    }
  })

  router.post('/sign-in/password', async (req, res) => {
    const payload = z
      .object({ 
        loginName: z.string().trim(), 
        password: z.string()
      })
      .safeParse(req.body)
    if (!payload.success) {
      res.status(400).end()
      return
    }

    const { loginName, password } = payload.data
    
    const decryptedPassword = AesTools.decrypt(password)

    const user = await prisma().user.findFirst({
      where: { 
        loginName,
        isDeleted: false
      },
      select: { 
        id: true, 
        email: true, 
        passwordDigest: true,
        status: true
      },
    })
    if (!user || !user.passwordDigest || user.status === 0) {
      res.status(400).end()
      return
    }

    const validPassword = await comparePassword({
      encrypted: user.passwordDigest,
      password: decryptedPassword,
    })
    if (!validPassword) {
      res.status(400).end()
      return
    }

    const loginLink = createLoginLink(user.id, config.FRONTEND_URL)

    res.json({ email: obscureEmail(user.email), loginLink })
  })

  router.get('/session', authenticationMiddleware, async (req, res) => {
    const userWorkspaces = await prisma().userWorkspace.findMany({
      where: { userId: req.session.user.id },
    })

    const user = transformUserSession
      ? transformUserSession(req.session.user)
      : req.session.user

    res.json({
      ...user,
      roles: fromPairs(userWorkspaces.map((uw) => [uw.workspaceId, uw.role])),
    })
  })

  router.get('/logout', authenticationMiddleware, async (req, res) => {
    const query = z.object({ callback: callbackUrlSchema }).safeParse(req.query)
    if (!query.success) {
      res.status(400).end()
      return
    }

    res.clearCookie('token')

    res.redirect(query.data.callback)
  })

  return router
}
