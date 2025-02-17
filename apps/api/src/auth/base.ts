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
 * Creates and configures an Express router for user authentication and workspace management.
 *
 * This function sets up multiple routes to handle the authentication workflow:
 * - **GET `/link/callback`**: Validates an incoming token from query parameters, decodes it, confirms the user's account,
 *   sets an authentication cookie, and redirects to the appropriate callback URL based on token validity and expiration.
 * - **POST `/sign-up/password`**: Validates the sign-up payload, ensures the workspace name and password meet the criteria,
 *   checks for an existing user by email, and within a database transaction, creates a new user and workspace.
 *   It then generates a login link for the created user.
 * - **POST `/sign-in/password`**: Validates the sign-in payload, decrypts the provided password, verifies the user's status and
 *   password digest, and, if valid, generates and returns a login link along with an obscured email.
 * - **GET `/session`**: Retrieves the current user's session data, fetching associated workspace roles.
 *   If provided, the session data is transformed using the optional transformUserSession function.
 * - **GET `/logout`**: Validates the callback URL from query parameters, clears the authentication cookie,
 *   and redirects the user to the callback URL.
 *
 * The router makes use of Zod for input validation, AesTools for password decryption, and Prisma for database operations.
 *
 * @param socketServer - The socket server instance used for emitting real-time events associated with workspace creation.
 * @param config - The base authentication configuration, including properties such as the FRONTEND_URL for redirection.
 * @param transformUserSession - An optional function to transform the API user session data into a custom format.
 * @returns The configured Express router with authentication and session management routes.
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
