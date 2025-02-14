import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'
import {
  prisma,
  Document,
  DataSource,
  UserWorkspaceRole,
  UserWorkspace,
} from '@briefer/database'
import { validate } from 'uuid'
import { logger } from '../logger.js'
import { getParam } from '../utils/express.js'
import { Session } from '../types.js'
import { config } from '../config/index.js'

function signToken(data: object, secret: string, expiresIn: string | number) {
  return jwt.sign(data, secret, {
    expiresIn,
  })
}

export function verifyToken<T>(
  token: string,
  decoder: z.ZodType<T>,
  secret: string
): { data?: T; isExpired: boolean } {
  try {
    const decoded = decoder.safeParse(jwt.decode(token))

    let isExpired = false
    try {
      jwt.verify(token, secret)
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        isExpired = true
      } else {
        logger().error({ err }, 'Error verifying token')
        throw err
      }
    }

    if (decoded.success) {
      return { data: decoded.data, isExpired }
    }

    return { data: undefined, isExpired }
  } catch (err) {
    logger().error({ err }, 'Error decoding token')
    return { data: undefined, isExpired: false }
  }
}

export function createLoginLink(userId: string, callback: string): string {
  const token = signToken(
    { userId, callback },
    config().LOGIN_JWT_SECRET,
    config().LOGIN_LINK_EXPIRATION
  )
  const link = `${config().API_URL}/auth/link/callback?t=${token}`

  return link
}

export function decodeLoginToken(token: string) {
  return verifyToken(
    token,
    z.object({ userId: z.string().min(1), callback: z.string().min(1) }),
    config().LOGIN_JWT_SECRET
  )
}

export function createAuthToken(userId: string, expiration?: string): string {
  return signToken(
    { userId },
    config().AUTH_JWT_SECRET,
    expiration ?? config().AUTH_JWT_EXPIRATION
  )
}

export function decodeAuthToken(token: string) {
  return verifyToken(
    token,
    z.object({ userId: z.string().min(1) }),
    config().AUTH_JWT_SECRET
  )
}

/**
 * Retrieves a session from the provided cookies by decoding an authentication token.
 *
 * The function extracts the JWT from the `cookies` object using the key "token". It then decodes this token,
 * checks if it is expired, and if valid, queries the database to fetch the associated user along with their workspaces.
 * If the user is found, a session object containing user details (including `loginName`, `phone`, `nickname`, `status`, and `isDeleted`)
 * and a mapping of the user's workspaces is returned. If any step fails (e.g., missing token, invalid or expired token, or user not found),
 * the function returns `null`.
 *
 * @param cookies - An object representing cookies where the "token" key should contain the JWT.
 * @returns A promise that resolves to a session object if a valid token is provided and the user exists, or `null` otherwise.
 *
 * @example
 * const session = await sessionFromCookies({ token: "your-jwt-token" });
 * if (session) {
 *   console.log("User authenticated:", session.user.email);
 * } else {
 *   console.log("Authentication failed, no valid session.");
 * }
 */
export async function sessionFromCookies(
  cookies: Record<string, string>
): Promise<Session | null> {
  const token = cookies['token']
  if (!token) {
    return null
  }

  const { data, isExpired } = decodeAuthToken(token)
  if (!data) {
    return null
  }

  if (isExpired) {
    return null
  }

  const user = await prisma().user.findUnique({
    where: { id: data.userId },
    select: {
      id: true,
      email: true,
      name: true,
      loginName: true,
      picture: true,
      phone: true,
      nickname: true,
      createdAt: true,
      updatedAt: true,
      workspaces: true,
      status: true,
      isDeleted: true,
    },
  })
  if (!user) {
    return null
  }

  const userWorkspaces: Record<string, UserWorkspace> = {}
  for (const uw of user.workspaces) {
    userWorkspaces[uw.workspaceId] = uw
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      loginName: user.loginName,
      picture: user.picture,
      phone: user.phone,
      nickname: user.nickname,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isDeleted: user.isDeleted,
    },
    userWorkspaces,
  }
}

/**
 * Express middleware that authenticates a user by validating the session from cookies and ensuring the user is active.
 *
 * The middleware retrieves a session via `sessionFromCookies` and queries the database to fetch the latest user data.
 * It checks whether the session exists and then verifies that the corresponding user is present, not deleted, and active.
 * If the validation fails at any step, it clears the token cookie and responds with:
 * - HTTP 401 if no session is found.
 * - HTTP 403 if the user is non-existent, disabled (status === 0), or marked as deleted, or if the JWT is invalid.
 * - HTTP 500 for any unexpected errors during token verification.
 *
 * @param req - The Express request object, which should include cookies.
 * @param res - The Express response object used to send HTTP responses.
 * @param next - The next middleware function in the Express request-response cycle.
 *
 * @returns A Promise that resolves to void. The function either calls `next()` to continue processing or sends an error response.
 */
export async function authenticationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await sessionFromCookies(req.cookies)
    if (!session) {
      res.status(401).end()
      return
    }

    // 检查用户状态
    const user = await prisma().user.findUnique({
      where: { 
        id: session.user.id,
        isDeleted: false
      }
    })

    if (!user || user.status === 0 || user.isDeleted) {
      res.clearCookie('token')
      res.status(403).json({
        code: 403,
        msg: '用户不存在或已被禁用',
        data: {}
      })
      return
    }

    req.session = session

    next()
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(403).send('Invalid token')
      return
    }

    req.log.error({ err }, 'Error verifying token')
    res.status(500).end()
  }
}

export function hasWorkspaceRoles(roles: UserWorkspaceRole[]) {
  const rolesSet = new Set(roles)

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = getParam(req, 'workspaceId')
      const userWorkspace = req.session.userWorkspaces[workspaceId]
      if (!userWorkspace) {
        res.status(403).end()
        return
      }

      if (!rolesSet.has(userWorkspace.role)) {
        res.status(403).end()
        return
      }

      next()
    } catch (err) {
      req.log.error({ err }, 'Error verifying workspace roles')
      res.status(500).end()
    }
  }
}

export function canUpdateWorkspace(
  req: Request,
  res: Response,
  next: NextFunction
) {
  hasWorkspaceRoles([UserWorkspaceRole.admin, UserWorkspaceRole.editor])(
    req,
    res,
    next
  )
}

/**
 * Middleware that checks if the current user is authorized to read a specified document.
 *
 * This function performs the following steps:
 * 1. Extracts the document ID from the request parameters.
 * 2. Validates the document ID, responding with a 400 status if invalid.
 * 3. Verifies that the user associated with the session is authorized to access the document.
 *    - If unauthorized, it responds with a 403 status.
 * 4. On successful authorization, it calls the next middleware in the Express stack.
 * 5. Catches and logs any errors, sending a 500 status if an exception occurs.
 *
 * @param req - The Express request object containing parameters and session data.
 * @param res - The Express response object used to send HTTP status responses.
 * @param next - The function to invoke the next middleware in the chain.
 */
export async function canReadDocument(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const documentId = getParam(req, 'documentId')
    if (!validate(documentId)) {
      res.status(400).end()
      return
    }

    const result = await isAuthorizedForDocument(
      documentId,
      req.session.user['id']
    )
    if (!result) {
      res.status(403).end()
      return
    }

    next()
  } catch (err) {
    req.log.error({ err }, 'Error verifying document access')
    res.status(500).end()
  }
}

export const isAuthorizedForDocument = async (
  documentId: string,
  userId: string
): Promise<Document | null> => {
  if (!validate(documentId) || !validate(userId)) {
    return null
  }

  const result = await prisma().document.findFirst({
    where: {
      id: documentId,
      workspace: {
        users: {
          some: {
            userId: userId,
          },
        },
      },
    },
  })

  if (!result) {
    return null
  }

  return result
}

export const isAuthorizedForDataSource = async (
  dataSourceId: string,
  dataSourceType: DataSource['type'],
  userId: string
): Promise<boolean> => {
  if (!validate(dataSourceId) || !validate(userId)) {
    return false
  }

  const query = {
    where: {
      id: dataSourceId,
      workspace: {
        users: {
          some: {
            userId: userId,
          },
        },
      },
    },
    select: {
      id: true,
    },
  }

  switch (dataSourceType) {
    case 'redshift': {
      const result = await prisma().redshiftDataSource.findFirst(query)
      return result !== null
    }
    case 'bigquery': {
      const result = await prisma().bigQueryDataSource.findFirst(query)
      return result !== null
    }
    case 'psql': {
      const result = await prisma().postgreSQLDataSource.findFirst(query)
      return result !== null
    }
    case 'athena': {
      const result = await prisma().athenaDataSource.findFirst(query)
      return result !== null
    }
    case 'oracle': {
      const result = await prisma().oracleDataSource.findFirst(query)
      return result !== null
    }
    case 'mysql': {
      const result = await prisma().mySQLDataSource.findFirst(query)
      return result !== null
    }
    case 'sqlserver': {
      const result = await prisma().sQLServerDataSource.findFirst(query)
      return result !== null
    }
    case 'trino': {
      const result = await prisma().trinoDataSource.findFirst(query)
      return result !== null
    }
    case 'snowflake': {
      const result = await prisma().snowflakeDataSource.findFirst(query)
      return result !== null
    }
  }
}
