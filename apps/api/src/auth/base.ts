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
 * Creates and returns an Express router configured with authentication and workspace management endpoints.
 *
 * The router includes the following routes:
 * - **GET /link/callback**: Validates a token passed as a query parameter, decodes the token to extract user data,
 *   checks for expiration, confirms the user, sets an authentication cookie using a generated token, and redirects
 *   to the specified callback URL.
 * - **POST /sign-up/password**: Validates the request payload for workspace and user details, ensures that the system
 *   needs setup, verifies the password and workspace name criteria, checks if the user already exists, creates a new user
 *   and workspace within a transaction, and responds with the created workspace and a login link.
 * - **POST /sign-in/password**: Validates the request payload for login credentials, decrypts the supplied password,
 *   searches for an active user based on the `loginName`, validates the password against the stored hashed value, and
 *   returns an obscured email along with a login link upon successful authentication.
 * - **GET /session**: Uses an authentication middleware to ensure the user is logged in, retrieves the user's workspaces
 *   and associated roles, applies an optional transformation to the user session if provided, and returns the user data.
 * - **GET /logout**: Validates the callback URL provided as a query parameter, clears the authentication cookie, and 
 *   redirects to the specified callback URL.
 *
 * @param socketServer - The socket server instance used for sending real-time updates during workspace creation.
 * @param config - The base authentication configuration object containing settings such as the frontend URL.
 * @param transformUserSession - An optional function to transform the user object stored in the session; useful for
 *   extending or customizing the session user data.
 *
 * @returns An Express router with configured authentication and workspace management routes.
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
