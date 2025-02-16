import { Server as IOServer } from 'socket.io'
import { config } from '../config/index.js'
import { JWT_EXPIRATION_MS } from './token.js'
import { CookieOptions } from '../types/cookie.js'
import parseDuration from 'parse-duration'
import getBaseRouter from './base.js'

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config().NODE_ENV === 'production' && !config().ALLOW_HTTP,
  sameSite: 'strict',
  maxAge: JWT_EXPIRATION_MS ?? undefined,
}

const key = new Uint8Array(Buffer.from(process.env['TOKEN_KEY']!, 'hex').buffer.slice(0))

export default function authRouter(socketServer: IOServer) {
  const cfg = config()

  return getBaseRouter(socketServer, cfg)
}
