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
 * Retrieves a session from cookies by verifying an authentication token and fetching the corresponding user from the database.
 *
 * This function extracts a JWT from the cookies (expected under the key "token") and decodes it using `decodeAuthToken`.
 * It checks whether the token exists, is valid, and has not expired. If valid, it queries the database for the user whose
 * ID matches the token's payload and constructs a session object that includes detailed user information and a mapping of the
 * user's workspaces. If any of these validations fail (e.g., missing or expired token, or user not found), it returns null.
 *
 * @param cookies - A record of cookie key-value pairs from which the authentication token is extracted.
 * @returns A promise that resolves to a Session object containing user details and workspace mappings, or null if no valid session can be derived.
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
 * Middleware that authenticates a user by verifying their session and token.
 *
 * This middleware retrieves the session from the incoming request cookies using the `sessionFromCookies` function.
 * If no valid session exists, it responds with a 401 status. It then verifies the user's status in the database
 * to ensure the user exists, is not deleted, and is active (i.e., has a non-zero status). If these checks fail,
 * it clears the token cookie and responds with a 403 status, indicating that the user does not exist or is disabled.
 * In the event of a JWT verification error (e.g., an invalid token), it responds with a 403 status. Any other errors
 * result in a 500 status response after logging the error.
 *
 * @param req - The Express Request object, which should contain cookies with the authentication token.
 * @param res - The Express Response object used to send back HTTP status codes and responses.
 * @param next - The callback function to pass control to the next middleware in the stack.
 *
 * @example
 * app.use(authenticationMiddleware);
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
 * Middleware to check if the authenticated user is authorized to read the specified document.
 *
 * This middleware extracts the document ID from the request, validates it, and then verifies whether the user has
 * access to the document using the "isAuthorizedForDocument" helper function. If the document ID is invalid, it responds
 * with a 400 (Bad Request). If the user is not authorized to access the document, it responds with a 403 (Forbidden). Any errors
 * encountered during the process result in the error being logged and a 500 (Internal Server Error) being returned.
 *
 * @param req - Express Request object containing HTTP request details and session information.
 * @param res - Express Response object used to send HTTP responses.
 * @param next - Express NextFunction callback to transfer control to the next middleware if authorization is successful.
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
